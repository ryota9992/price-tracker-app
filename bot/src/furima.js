import fs from 'node:fs';
import path from 'node:path';
import { IMAGE_DIR } from './config.js';
import { findFirst, textOf } from './browser.js';
import { log } from './logger.js';

/** 商品URLから商品IDを取り出す。 /item/xxxxxxxx 形式を想定。 */
export function itemIdFromUrl(url) {
  const match = String(url).match(/\/item\/([^/?#]+)/);
  return match ? match[1] : null;
}

export function itemUrl(selectors, itemId) {
  return selectors.baseUrl + selectors.urls.itemDetail.replace('{itemId}', itemId);
}

export async function isLoggedIn(page, selectors) {
  const found = await findFirst(page, selectors.loggedInCheck.candidates, { timeout: 6000 });
  if (found) return true;
  const loggedOut = await findFirst(page, selectors.loggedInCheck.loggedOutCandidates, {
    timeout: 3000,
  });
  return !loggedOut;
}

/** 出品した商品一覧ページを開く。URL候補を順に試す。 */
export async function openMyListings(page, selectors) {
  const candidates = Array.isArray(selectors.urls.myListings)
    ? selectors.urls.myListings
    : [selectors.urls.myListings];

  for (const candidate of candidates) {
    const url = candidate.startsWith('http') ? candidate : selectors.baseUrl + candidate;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => null);
    if (!response || response.status() >= 400) continue;
    // 商品リンクが1つでも描画されれば正しいページとみなす
    const anyItem = await findFirst(page, selectors.myListings.itemLink, { timeout: 8000 });
    if (anyItem) return url;
  }
  throw new Error(
    '出品した商品一覧ページを開けませんでした。selectors.json の urls.myListings を `npm run inspect` の結果を見て修正してください。'
  );
}

/** 一覧から出品中/売却済みの商品を拾う。 */
export async function scrapeMyListings(page, selectors) {
  const cardLocator = await findFirst(page, selectors.myListings.itemCard, { timeout: 8000 });
  if (!cardLocator) {
    throw new Error(
      '出品カードを認識できませんでした。selectors.json の myListings.itemCard を修正してください。'
    );
  }
  // 見つかった候補と同じセレクタで全件取る
  const workingSelector = await resolveWorkingSelector(page, selectors.myListings.itemCard);
  const cards = page.locator(workingSelector);
  const count = await cards.count();

  const soldTexts = selectors.myListings.soldBadge.textCandidates;
  const results = [];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const href = await card
      .locator(selectors.myListings.itemLink[0])
      .first()
      .getAttribute('href')
      .catch(() => null);
    const itemId = href ? itemIdFromUrl(href) : null;
    if (!itemId) continue;

    const cardText = (await card.innerText().catch(() => '')) || '';
    const sold = soldTexts.some((text) => cardText.includes(text));

    results.push({
      itemId,
      url: href.startsWith('http') ? href : selectors.baseUrl + href,
      title: (await textOf(card, selectors.myListings.itemTitle)) || cardText.split('\n')[0] || '',
      sold,
    });
  }
  // 同じ商品が複数カードで出てくる場合に備えて重複排除
  const seen = new Set();
  return results.filter((item) => !seen.has(item.itemId) && seen.add(item.itemId));
}

async function resolveWorkingSelector(scope, candidates) {
  for (const selector of candidates) {
    if ((await scope.locator(selector).count()) > 0) return selector;
  }
  return candidates[0];
}

/** 商品詳細から再出品に必要な情報を丸ごと取る。画像もローカルに保存する。 */
export async function snapshotItem(context, selectors, itemId) {
  const page = await context.newPage();
  try {
    await page.goto(itemUrl(selectors, itemId), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const detail = selectors.itemDetail;
    const priceText = await textOf(page, detail.price);

    const snapshot = {
      itemId,
      title: await textOf(page, detail.title),
      description: await textOf(page, detail.description),
      price: parsePrice(priceText),
      priceText,
      condition: cleanValue(await textOf(page, detail.condition)),
      shippingPayer: cleanValue(await textOf(page, detail.shippingPayer)),
      shippingMethod: cleanValue(await textOf(page, detail.shippingMethod)),
      shippingFrom: cleanValue(await textOf(page, detail.shippingFrom)),
      shippingDays: cleanValue(await textOf(page, detail.shippingDays)),
      category: await readCategory(page, detail),
      images: [],
      capturedAt: new Date().toISOString(),
    };

    snapshot.images = await downloadImages(context, page, selectors, itemId);

    if (!snapshot.title) {
      throw new Error(
        `商品 ${itemId} のタイトルを取得できませんでした。selectors.json の itemDetail.title を確認してください。`
      );
    }
    return snapshot;
  } finally {
    await page.close();
  }
}

function parsePrice(text) {
  const match = String(text).replace(/,/g, '').match(/(\d{2,9})/);
  return match ? Number(match[1]) : null;
}

/** 「商品の状態 目立った傷や汚れなし」のようにラベルごと取れた場合にラベルを落とす。 */
function cleanValue(text) {
  return String(text)
    .replace(/^(商品の状態|配送料の負担|配送の方法|発送元の地域|発送元|発送までの日数)\s*/u, '')
    .trim();
}

async function readCategory(page, detail) {
  const links = page.locator(detail.category[0]);
  const count = await links.count().catch(() => 0);
  if (!count) return [];
  const parts = [];
  for (let i = 0; i < count; i++) {
    const text = (await links.nth(i).innerText().catch(() => '')).trim();
    if (text && text !== 'ホーム' && text !== 'Yahoo!フリマ') parts.push(text);
  }
  return parts;
}

async function downloadImages(context, page, selectors, itemId) {
  const dir = path.join(IMAGE_DIR, itemId);
  fs.mkdirSync(dir, { recursive: true });

  const imgs = page.locator(selectors.itemDetail.images[0]);
  const count = await imgs.count().catch(() => 0);
  const urls = [];
  for (let i = 0; i < count; i++) {
    const src = await imgs.nth(i).getAttribute('src').catch(() => null);
    if (!src) continue;
    // 相対パスや //host 形式でも取り込めるよう絶対URLに直す
    const absolute = new URL(src, page.url()).href;
    if (!urls.includes(absolute)) urls.push(absolute);
  }

  const saved = [];
  for (const [index, url] of urls.slice(0, 10).entries()) {
    try {
      const response = await context.request.get(url);
      if (!response.ok()) continue;
      const buffer = await response.body();
      // 極端に小さい画像はアイコン類なので除外する
      if (buffer.length < 8000) continue;
      const file = path.join(dir, `${String(index).padStart(2, '0')}.jpg`);
      fs.writeFileSync(file, buffer);
      saved.push(file);
    } catch (error) {
      log.warn('画像の保存に失敗:', url, error.message);
    }
  }
  return saved;
}

/** スナップショットと同じ内容で新規出品する。dryRun のときは公開ボタンを押さない。 */
export async function createListing(context, selectors, snapshot, { dryRun }) {
  const form = selectors.sellForm;
  const page = await context.newPage();
  try {
    await page.goto(selectors.baseUrl + selectors.urls.sell, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const fileInput = await findFirst(page, form.fileInput, { timeout: 15000 });
    if (!fileInput) {
      throw new Error(
        '出品フォームの画像入力欄が見つかりません。selectors.json の sellForm.fileInput を確認してください。'
      );
    }
    const images = snapshot.images.filter((file) => fs.existsSync(file));
    if (images.length === 0) {
      throw new Error('保存済みの商品画像がありません。再出品を中止しました。');
    }
    await fileInput.setInputFiles(images);
    await page.waitForTimeout(3000);

    await fill(page, form.title, snapshot.title);
    await fill(page, form.description, snapshot.description);
    await fill(page, form.price, snapshot.price != null ? String(snapshot.price) : '');

    await choose(page, form, 'categoryOpen', snapshot.category?.[snapshot.category.length - 1]);
    await choose(page, form, 'conditionOpen', snapshot.condition);
    await choose(page, form, 'shippingPayerOpen', snapshot.shippingPayer);
    await choose(page, form, 'shippingMethodOpen', snapshot.shippingMethod);
    await choose(page, form, 'shippingFromOpen', snapshot.shippingFrom);
    await choose(page, form, 'shippingDaysOpen', snapshot.shippingDays);

    const shot = path.join(IMAGE_DIR, snapshot.itemId, 'sell-form.png');
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

    if (dryRun) {
      log.info('dryRun のため出品は実行しませんでした。入力後の画面:', shot);
      return { dryRun: true, screenshot: shot };
    }

    const submit = await findFirst(page, form.submitButton, { timeout: 10000 });
    if (!submit) throw new Error('出品ボタンが見つかりません。sellForm.submitButton を確認してください。');
    await submit.click();
    await page.waitForTimeout(3000);

    // 確認画面がある場合は続けて押す
    const confirm = await findFirst(page, form.confirmButton, { timeout: 5000 });
    if (confirm && (await confirm.isVisible().catch(() => false))) {
      await confirm.click();
      await page.waitForTimeout(3000);
    }

    await page.waitForTimeout(3000);
    const bodyText = await page.innerText('body').catch(() => '');
    const success =
      form.successCheck.textCandidates.some((text) => bodyText.includes(text)) ||
      page.url().includes(form.successCheck.urlPattern);

    if (!success) {
      const failShot = path.join(IMAGE_DIR, snapshot.itemId, 'sell-failed.png');
      await page.screenshot({ path: failShot, fullPage: true }).catch(() => {});
      throw new Error(`出品完了を確認できませんでした。画面: ${failShot} / URL: ${page.url()}`);
    }

    return { dryRun: false, newItemId: itemIdFromUrl(page.url()), url: page.url() };
  } finally {
    await page.close();
  }
}

async function fill(page, candidates, value) {
  if (value == null || value === '') return;
  const field = await findFirst(page, candidates, { timeout: 8000 });
  if (!field) {
    log.warn('入力欄が見つかりませんでした:', JSON.stringify(candidates));
    return;
  }
  await field.click().catch(() => {});
  await field.fill(String(value));
  await page.waitForTimeout(400);
}

/** プルダウン/モーダル形式の選択肢を、表示テキストで選ぶ。 */
async function choose(page, form, openKey, value) {
  if (!value) return;
  const opener = await findFirst(page, form[openKey], { timeout: 5000 });
  if (!opener) {
    log.warn(`${openKey} が見つからないためスキップしました（値: ${value}）`);
    return;
  }
  await opener.click().catch(() => {});
  await page.waitForTimeout(800);

  const optionSelector = form.optionItemByText.replaceAll('{text}', value);
  const option = page.locator(optionSelector).first();
  if (await option.count()) {
    await option.click().catch(() => {});
  } else {
    log.warn(`選択肢「${value}」が見つかりませんでした（${openKey}）。手動確認が必要です。`);
    await page.keyboard.press('Escape').catch(() => {});
  }
  await page.waitForTimeout(600);
}
