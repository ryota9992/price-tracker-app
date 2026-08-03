import fs from 'node:fs';
import path from 'node:path';
import { INSPECT_DIR, ensureDirs } from './config.js';
import { absoluteUrl } from './furima.js';
import { log } from './logger.js';

/** 調査対象の画面をひととおり回る。CLIからも画面からも使う。 */
export async function runInspect(page, selectors, itemId) {
  const listingUrls = Array.isArray(selectors.urls.myListings)
    ? selectors.urls.myListings
    : [selectors.urls.myListings];

  await inspectPage(page, 'top', absoluteUrl(selectors, '/'));
  for (const [index, url] of listingUrls.entries()) {
    await inspectPage(page, `mylistings-${index}`, absoluteUrl(selectors, url));
  }
  await inspectPage(page, 'sell', absoluteUrl(selectors, selectors.urls.sell));

  // 商品ページは写真の取り方を確定するのに必要。指定がなければ一覧から1つ拾う。
  const target = itemId || (await firstItemIdOnPage(page));
  if (target) {
    await inspectPage(page, 'item', absoluteUrl(selectors, selectors.urls.itemDetail.replace('{itemId}', target)));
  } else {
    log.warn('商品ページを調べられませんでした。商品URLを指定して調べ直してください。');
  }
  log.info('調査結果を data/inspect/ に保存しました。');
}

async function firstItemIdOnPage(page) {
  const href = await page
    .locator("a[href*='/item/']")
    .first()
    .getAttribute('href')
    .catch(() => null);
  const match = href && href.match(/\/item\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * ログイン済みブラウザで各画面のHTML・スクリーンショット・候補セレクタを吐き出す。
 * selectors.json を実際のDOMに合わせて埋めるための道具。
 */
export async function inspectPage(page, name, url) {
  ensureDirs();
  log.info(`inspect: ${name} → ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // このサイトは中身をJSで描画するので、通信が落ち着くまで待たないと空のHTMLを保存してしまう
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const base = path.join(INSPECT_DIR, name);
  fs.writeFileSync(`${base}.html`, await page.content());
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});

  const hints = await page.evaluate(() => {
    const describe = (el) => {
      const classes = (el.className && typeof el.className === 'string' ? el.className : '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join('.');
      return [
        el.tagName.toLowerCase(),
        el.id ? `#${el.id}` : '',
        classes ? `.${classes}` : '',
        el.getAttribute('name') ? `[name="${el.getAttribute('name')}"]` : '',
        el.getAttribute('placeholder') ? `[placeholder="${el.getAttribute('placeholder')}"]` : '',
      ].join('');
    };

    const collect = (selector, limit = 30) =>
      Array.from(document.querySelectorAll(selector))
        .slice(0, limit)
        .map((el) => ({
          selector: describe(el),
          text: (el.innerText || el.value || '').trim().slice(0, 60),
        }));

    return {
      url: location.href,
      title: document.title,
      itemLinks: Array.from(document.querySelectorAll("a[href*='/item/']"))
        .slice(0, 20)
        .map((a) => a.getAttribute('href')),
      // 写真の取り方を確定するために必要。表示サイズも入れて商品写真とアイコンを見分ける。
      images: Array.from(document.querySelectorAll('img'))
        .filter((img) => img.naturalWidth > 150 && img.naturalHeight > 150)
        .slice(0, 20)
        .map((img) => ({
          src: img.currentSrc || img.src,
          size: `${img.naturalWidth}x${img.naturalHeight}`,
          selector: describe(img),
          inMain: !!img.closest('main'),
        })),
      // 画面の見つけ方を確定するために、ページ内のリンクも控えておく
      links: [...new Set(Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href'))
        .filter((href) => href && !href.startsWith('#')))].slice(0, 60),
      inputs: collect('input, textarea, select'),
      buttons: collect('button, [role="button"]'),
      headings: collect('h1, h2, h3', 15),
      // 「商品の状態」などのラベルと値の対応
      definitions: Array.from(document.querySelectorAll('dt')).slice(0, 20).map((dt) => ({
        label: (dt.innerText || '').trim().slice(0, 30),
        value: (dt.nextElementSibling?.innerText || '').trim().slice(0, 40),
        nextTag: dt.nextElementSibling?.tagName?.toLowerCase() || null,
      })),
      soldLike: Array.from(document.querySelectorAll('*'))
        .filter((el) => {
          const text = (el.childNodes.length === 1 ? el.textContent : '') || '';
          return /売却済み|SOLD|売り切れ|取引中/.test(text.trim());
        })
        .slice(0, 10)
        .map(describe),
    };
  });

  fs.writeFileSync(`${base}.hints.json`, JSON.stringify(hints, null, 2));
  log.info(`保存しました: ${base}.html / ${base}.png / ${base}.hints.json`);
  return hints;
}
