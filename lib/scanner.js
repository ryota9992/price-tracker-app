import { chromium as playwrightChromium } from 'playwright-core';
import chromiumBinary from '@sparticuz/chromium-min';

const BASE_URL = 'https://hikaku-342505.firebaseapp.com/';

// @sparticuz/chromium-min はバイナリを同梱しないため、リリースからpackを取得する。
// package.json の @sparticuz/chromium-min のバージョンを上げたら、対応するpackのURLも更新すること。
// 一覧: https://github.com/Sparticuz/chromium/releases
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ||
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

const STEP_TIMEOUT = 20000;

// 検索結果の本文テキストから、ショップ名らしくない行（見出しやボタン）を除外する
const IGNORE_LINES = new Set([
  'ショップ',
  '買取価格',
  '取得時間',
  '利益額',
  '率',
  '数量',
  '購入価格',
  'かごに入れる',
  '推移',
  'EC',
  '商品検索',
  'カメラスキャン',
  '文字',
  'バーコード',
  '設定',
  '商品名 / JAN / ASINから選択',
]);

export class ScannerError extends Error {
  constructor(message, { step, debugInfo } = {}) {
    super(message);
    this.name = 'ScannerError';
    this.step = step;
    this.debugInfo = debugInfo || null;
  }
}

function loadStorageState() {
  const raw = process.env.KAITORI_SCANNER_STORAGE_STATE;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ScannerError(
      'KAITORI_SCANNER_STORAGE_STATE の内容がJSONとして読み取れません（コピーが途中で切れている可能性）',
      { step: 'config' }
    );
  }
}

async function captureDebug(page, step) {
  try {
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 40, fullPage: false });
    return {
      step,
      url: page.url(),
      screenshot: `data:image/jpeg;base64,${screenshot.toString('base64')}`,
    };
  } catch {
    return { step, url: null, screenshot: null };
  }
}

function parseShops(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const shops = [];

  for (let i = 0; i < lines.length; i++) {
    const priceMatch = lines[i].match(/^[¥￥]?([\d,]{4,})(円)?$/);
    if (!priceMatch) continue;

    const price = Number(priceMatch[1].replace(/,/g, ''));
    if (!Number.isFinite(price) || price <= 0) continue;

    // 価格の直前数行から、店名らしい行を探す（数字/記号だけの行や見出しは除外）
    let name = null;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const candidate = lines[j];
      if (!candidate || IGNORE_LINES.has(candidate)) continue;
      if (/^[\d,¥￥\-+%時間分前]+$/.test(candidate)) continue;
      name = candidate.replace(/\s*(open_in_new|↗)\s*$/i, '').trim();
      break;
    }

    if (name && name.length > 0 && name.length <= 24) {
      shops.push({ name, price });
    }
  }

  const seen = new Set();
  return shops.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
}

async function launchBrowser() {
  const executablePath = await chromiumBinary.executablePath(CHROMIUM_PACK_URL);
  return playwrightChromium.launch({
    args: chromiumBinary.args,
    executablePath,
    headless: true,
  });
}

/**
 * 買取スキャナー（hikaku-342505.firebaseapp.com）で商品を検索し、
 * 各ショップの買取価格を取得する。
 *
 * このサイトはGoogleアカウントでのログインのみで、Googleログインの自動化は
 * bot検知・アカウント保護の観点から行わない。代わりに、あなた自身が事前に
 * `npm run capture-scanner-session` で手動ログインして取得した
 * ログイン済みセッション（KAITORI_SCANNER_STORAGE_STATE）を読み込んで使う。
 *
 * サイトのDOM構造を直接確認できない状態で実装しているため、
 * テキスト・role・placeholder ベースの緩い探索にしてある。
 * 失敗時は debug:true でスクリーンショットを添えたエラーを投げる。
 */
export async function searchScannerPrices(query, { debug = false } = {}) {
  const storageState = loadStorageState();

  if (!storageState) {
    throw new ScannerError(
      '買取スキャナーのログインセッションが設定されていません（KAITORI_SCANNER_STORAGE_STATE）。' +
        'npm run capture-scanner-session で取得してVercelに設定してください',
      { step: 'config' }
    );
  }
  if (!query || !query.trim()) {
    throw new ScannerError('検索する商品名がありません', { step: 'config' });
  }

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'ja-JP',
      storageState,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT);

    // --- トップページを開く（ログイン済みセッションで直接入れるはず） ---
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT });
    } catch {
      throw new ScannerError('買取スキャナーを開けませんでした', {
        step: 'goto',
        debugInfo: debug ? await captureDebug(page, 'goto') : null,
      });
    }

    if (page.url().includes('/auth/login')) {
      throw new ScannerError(
        'ログインセッションが切れています。npm run capture-scanner-session で取得し直してください',
        { step: 'session_expired', debugInfo: debug ? await captureDebug(page, 'session_expired') : null }
      );
    }

    // --- 商品検索 ---
    try {
      const searchInput = page.getByPlaceholder(/商品名|JAN|ASIN/).first();
      await searchInput.waitFor({ state: 'visible', timeout: 15000 });
      await searchInput.click();
      await searchInput.fill(query);
      await page.waitForTimeout(1500);

      const option = page.getByRole('option').first();
      if ((await option.count()) > 0) {
        await option.click();
      } else {
        await searchInput.press('Enter');
      }
    } catch {
      throw new ScannerError('商品検索の操作に失敗しました', {
        step: 'search',
        debugInfo: debug ? await captureDebug(page, 'search') : null,
      });
    }

    // --- 結果待ち ---
    try {
      await page.waitForSelector('text=ショップ', { timeout: 15000 });
      await page.waitForTimeout(1200); // 価格の非同期読み込みを待つ
    } catch {
      throw new ScannerError('検索結果が表示されませんでした（商品が見つからない可能性があります）', {
        step: 'wait_results',
        debugInfo: debug ? await captureDebug(page, 'wait_results') : null,
      });
    }

    const bodyText = await page.evaluate(() => document.body.innerText);
    const shops = parseShops(bodyText).sort((a, b) => b.price - a.price);

    return {
      shops,
      productUrl: page.url(),
      debugInfo: debug ? await captureDebug(page, 'success') : null,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
