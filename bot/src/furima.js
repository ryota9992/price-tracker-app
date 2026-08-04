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
  return absoluteUrl(selectors, selectors.urls.itemDetail.replace('{itemId}', itemId));
}

/** 別ドメインの画面（出品フォームなど）もあるので、http始まりならそのまま使う。 */
export function absoluteUrl(selectors, pathOrUrl) {
  return pathOrUrl.startsWith('http') ? pathOrUrl : selectors.baseUrl + pathOrUrl;
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
export async function openMyListings(page, selectors, key = 'myListings') {
  const raw = selectors.urls[key];
  const candidates = Array.isArray(raw) ? raw : [raw];

  // 一覧はJSで描画されるため、混んでいると初回だけ間に合わないことがある。
  // 1度きりで諦めず、間を置いて読み直す。
  for (let attempt = 1; attempt <= 2; attempt++) {
    for (const candidate of candidates) {
      const url = absoluteUrl(selectors, candidate);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => null);
      if (!response || response.status() >= 400) continue;
      // 商品リンクが1つでも描画されれば正しいページとみなす
      const anyItem = await findFirst(page, selectors.myListings.itemLink, { timeout: 15000 });
      if (anyItem) return url;
    }
    if (attempt === 1) {
      log.warn('出品した商品一覧を読み込めませんでした。少し待って読み直します。');
      await page.waitForTimeout(5000);
    }
  }
  throw new Error(
    '出品した商品一覧ページを開けませんでした。selectors.json の urls.myListings を `npm run inspect` の結果を見て修正してください。'
  );
}

/**
 * 一覧ページに載っている商品IDを拾う。
 * カードの見た目には一切依存せず、商品リンクのIDだけを集める。
 */
export async function scrapeItemIds(page, selectors) {
  const links = page.locator(selectors.myListings.itemLink[0]);
  const count = await links.count().catch(() => 0);
  const ids = new Set();
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute('href').catch(() => null);
    const itemId = href && itemIdFromUrl(href);
    if (itemId) ids.add(itemId);
  }
  return ids;
}

/**
 * 出品中と売却済みの両方のページを見て、いまどちらに載っているかを返す。
 * Yahoo!フリマは出品中(/my/item/selling)と売却済み(/my/item/sold)でページが分かれているので、
 * 「売却済みバッジ」を探すより、どちらに載っているかで見るほうが確実。
 */
export async function fetchListingState(page, selectors) {
  await openMyListings(page, selectors, 'myListings');
  const selling = await scrapeItemIds(page, selectors);

  let sold = new Set();
  try {
    await openMyListings(page, selectors, 'soldListings');
    sold = await scrapeItemIds(page, selectors);
  } catch (error) {
    // 売却済みが0件だとページに商品リンクが無く、開けたのに空とみなされる。
    // ここで止めると監視全体が止まってしまうので、警告に留める。
    log.warn('売却済みページを読めませんでした（売れたものが無いだけの可能性もあります）:', error.message);
  }

  log.info(`出品中 ${selling.size} 件 / 売却済み ${sold.size} 件を確認しました。`);
  return { selling, sold };
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

    // 「もっと読む」で説明文が省略されている。押さずに読むと途中で切れたまま再出品してしまう。
    const more = page.locator("button:has-text('もっと読む')").first();
    if (await more.count()) {
      await more.click().catch(() => {});
      await page.waitForTimeout(800);
    }

    const info = parseInfoSection(await readSectionText(page, detail.infoHeading));

    const snapshot = {
      itemId,
      title: await textOf(page, detail.title),
      description: cleanDescription(await readSectionText(page, detail.descriptionHeading), detail.descriptionHeading),
      price: parsePrice(priceText),
      priceText,
      condition: info['商品の状態'] || '',
      shippingMethod: info['配送の方法'] || '',
      shippingFrom: info['発送元の地域'] || info['発送元'] || '',
      shippingDays: info['発送までの日数'] || '',
      category: await readCategory(page, detail),
      categoryText: info['カテゴリ'] || '',
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

/**
 * 見出し（「商品説明」「商品の情報」）を含むかたまりの文字をそのまま取る。
 * この画面は dl/dt ではなく、クラス名も自動生成で当てにならないため、
 * 見出しを手がかりにするのが一番壊れにくい。
 */
async function readSectionText(page, headingText) {
  return page
    .evaluate((wanted) => {
      const heading = Array.from(document.querySelectorAll('h2, h3')).find(
        (el) => (el.innerText || '').trim() === wanted
      );
      if (!heading) return '';
      return heading.parentElement?.innerText || '';
    }, headingText)
    .catch(() => '');
}

/**
 * 「商品の情報」は "商品の状態\t未使用" のようにタブ区切りで並んでいる。
 * なお Yahoo!フリマは全品送料無料なので「配送料の負担」という項目は存在しない。
 */
function parseInfoSection(text) {
  const result = {};
  for (const line of String(text).split('\n')) {
    const [label, ...rest] = line.split('\t');
    const value = rest.join('\t').trim();
    if (label && value) result[label.trim()] = value;
  }
  return result;
}

/** 説明文のかたまりから、見出しや更新日時などの付随表示を落とす。 */
function cleanDescription(text, heading = '商品説明') {
  const lines = String(text).split('\n');
  const dropped = lines.filter(
    (line) =>
      line.trim() !== heading &&
      line.trim() !== 'もっと読む' &&
      !/^公開日時[：:]/.test(line.trim()) &&
      !/^出品日時[：:]/.test(line.trim()) &&
      !/(前に更新|に更新)$/.test(line.trim())
  );
  return dropped.join('\n').trim();
}

async function readCategory(page, detail) {
  const links = page.locator(await resolveWorkingSelector(page, detail.category));
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

  // 候補を上から順に試し、実際に画像が取れたものを採用する。
  // 1つ目の候補しか見ないと、サイト側の変更で画像0枚のまま気づけない。
  const urls = [];
  for (const selector of selectors.itemDetail.images) {
    const imgs = page.locator(selector);
    const count = await imgs.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const src =
        (await imgs.nth(i).getAttribute('src').catch(() => null)) ||
        (await imgs.nth(i).getAttribute('data-src').catch(() => null));
      if (!src || src.startsWith('data:')) continue;
      // 相対パスや //host 形式でも取り込めるよう絶対URLに直す
      const absolute = new URL(src, page.url()).href;
      if (!urls.includes(absolute)) urls.push(absolute);
    }
    if (urls.length) break;
  }

  if (urls.length === 0) {
    log.warn(
      `商品 ${itemId} の画像が1枚も見つかりませんでした。selectors.json の itemDetail.images を確認してください。`
    );
    return [];
  }

  const saved = [];
  let tooSmall = 0;
  for (const [index, url] of urls.slice(0, 10).entries()) {
    try {
      const response = await context.request.get(url);
      if (!response.ok()) continue;
      const buffer = await response.body();
      // 極端に小さい画像はアイコン類なので除外する
      if (buffer.length < 8000) {
        tooSmall += 1;
        continue;
      }
      const file = path.join(dir, `${String(index).padStart(2, '0')}.jpg`);
      fs.writeFileSync(file, buffer);
      saved.push(file);
    } catch (error) {
      log.warn('画像の保存に失敗:', url, error.message);
    }
  }
  if (saved.length === 0) {
    log.warn(
      `商品 ${itemId} の画像候補 ${urls.length} 件はすべて保存できませんでした（小さすぎて除外: ${tooSmall} 件）。`
    );
  }
  return saved;
}

/**
 * Yahoo!フリマ自身の「コピーして出品」を試す。
 * 成功すればタイトル等が最初から埋まった状態になるので、こちらで埋め直す必要がない。
 * 埋まっていなければ false を返し、呼び出し側が手入力方式に切り替える。
 */
/**
 * コピー出品を開くと、フォームの手前に「製品選択」が出てきて先に進めない。
 * 元の出品がカタログ製品に紐づいていれば同じものを選び、なければ「選択しない」で閉じる。
 */
async function dismissProductPicker(page, form, snapshot) {
  const heading = await findFirst(page, form.productPickerHeading, { timeout: 3000 });
  if (!heading) return;

  log.info('「製品選択」が出たので、元の出品に合わせて閉じます。');

  // 元の商品名に含まれる語で候補を選べるなら、それが元の出品と同じ状態に近い
  const buttons = page.locator('button:not(:has-text("選択しない"))');
  const count = await buttons.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const text = (await buttons.nth(i).innerText().catch(() => '')).trim();
    if (!text || text.length < 4) continue;
    // 「Apple AirTag 1パック （2100000015371）」のような製品名
    const core = text.replace(/（[^）]*）/g, '').trim();
    if (core && snapshot.title && snapshot.title.includes(core.split(/\s+/)[0])) {
      await buttons.nth(i).click().catch(() => {});
      await page.waitForTimeout(1500);
      log.info(`製品「${core}」を選びました。`);
      return;
    }
  }

  const skip = await findFirst(page, form.productPickerSkip, { timeout: 3000 });
  if (skip) {
    await skip.click().catch(() => {});
    await page.waitForTimeout(1500);
    log.info('製品は選ばずに進みました。');
  }
}

async function tryCopyListing(page, selectors, snapshot) {
  if (!selectors.urls.sellCopy) return false;
  const url = selectors.urls.sellCopy.replace('{itemId}', snapshot.itemId);
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);

  await dismissProductPicker(page, selectors.sellForm, snapshot);

  const titleField = await findFirst(page, selectors.sellForm.title, { timeout: 10000 });
  if (!titleField) return false;

  const filled = await titleField.inputValue().catch(() => '');
  if (!filled.trim()) {
    log.info('コピー出品では中身が復元されませんでした。手入力で進めます。');
    return false;
  }
  log.info(`コピー出品が使えました（復元されたタイトル: ${filled}）。`);
  return true;
}

/** スナップショットと同じ内容で新規出品する。dryRun のときは公開ボタンを押さない。 */
export async function createListing(context, selectors, snapshot, { dryRun }) {
  const form = selectors.sellForm;
  const page = await context.newPage();
  try {
    const copied = await tryCopyListing(page, selectors, snapshot);

    if (!copied) {
      await page.goto(absoluteUrl(selectors, selectors.urls.sell), { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const images = snapshot.images.filter((file) => fs.existsSync(file));
      if (images.length === 0) {
        throw new Error('保存済みの商品画像がありません。再出品を中止しました。');
      }
      await attachImages(page, form, images);

      await fill(page, form.title, snapshot.title);
      await fill(page, form.description, snapshot.description);
      await fill(page, form.price, snapshot.price != null ? String(snapshot.price) : '');
    }

    // コピー出品が効いた場合は全項目が復元済みなので、こちらから触らない。
    if (!copied) {
      // 発送までの日数と発送元は本物の <select>。クリックではなく選択肢の文字で選ぶ。
      await pickOption(page, form.shippingDaysSelect, snapshot.shippingDays);
      await pickOption(page, form.shippingFromSelect, snapshot.shippingFrom);
      await tickShippingMethod(page, form, snapshot.shippingMethod);

      await choose(page, form, 'categoryOpen', snapshot.category?.[snapshot.category.length - 1]);
      await choose(page, form, 'conditionOpen', snapshot.condition);
      await choose(page, form, 'shippingPayerOpen', snapshot.shippingPayer);
    }

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

/**
 * 写真をフォームに添付する。
 * 実機の出品フォームには input[type=file] が最初から存在せず、
 * 「画像を追加する」を押した時点でファイル選択が開く作りだった。
 * そのため、まず選択ダイアログを捕まえる方式を試し、駄目なら通常のinputに入れる。
 */
async function attachImages(page, form, images) {
  const addButton = page.locator("button:has-text('画像を追加する')").first();

  if (await addButton.count()) {
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        addButton.click(),
      ]);
      await chooser.setFiles(images);
      await page.waitForTimeout(3000);
      log.info(`写真を ${images.length} 枚添付しました。`);
      return;
    } catch {
      log.warn('「画像を追加する」からの添付に失敗しました。別の方法を試します。');
    }
  }

  const fileInput = await findFirst(page, form.fileInput, { timeout: 10000 });
  if (!fileInput) {
    throw new Error(
      '写真を添付できませんでした。selectors.json の sellForm.fileInput を確認してください。'
    );
  }
  await fileInput.setInputFiles(images);
  await page.waitForTimeout(3000);
  log.info(`写真を ${images.length} 枚添付しました。`);
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

/** 本物の <select> を選択肢の表示文字で選ぶ。「1~2日で発送」と「1~2日」のような表記ゆれも吸収する。 */
async function pickOption(page, candidates, value) {
  if (!value || !candidates) return;
  const select = await findFirst(page, candidates, { timeout: 5000 });
  if (!select) {
    log.warn(`選択欄が見つかりませんでした（値: ${value}）`);
    return;
  }
  const labels = await select.locator('option').allInnerTexts().catch(() => []);
  const normalize = (text) => text.replace(/[〜～]/g, '~').replace(/\s|で発送|の地域/g, '');
  const wanted = normalize(value);
  const hit =
    labels.find((label) => normalize(label) === wanted) ||
    labels.find((label) => normalize(label) && wanted.includes(normalize(label))) ||
    labels.find((label) => normalize(label).includes(wanted));

  if (!hit) {
    log.warn(`「${value}」に合う選択肢がありませんでした（候補: ${labels.join(' / ')}）`);
    return;
  }
  await select.selectOption({ label: hit }).catch(async () => {
    await select.selectOption({ value: hit }).catch(() => {});
  });
  await page.waitForTimeout(400);
}

/** 配送方法はチェックボックス。元の出品と同じものにチェックを入れる。 */
async function tickShippingMethod(page, form, value) {
  if (!value || !form.shippingMethodCheckbox) return;
  const entries = Object.entries(form.shippingMethodCheckbox);

  const tick = async (label, selector) => {
    const box = page.locator(selector).first();
    if (!(await box.count())) return false;
    await box.check({ force: true }).catch(() => box.click({ force: true }).catch(() => {}));
    log.info(`配送方法「${label}」を選びました。`);
    await page.waitForTimeout(400);
    return true;
  };

  // まずは完全一致。「おてがる配送（ヤマト運輸）」と「おてがる配送（日本郵便）」は
  // 括弧の中だけが違うので、ここを緩めると別の配送業者を選んでしまう。
  for (const [label, selector] of entries) {
    if (value.includes(label) && (await tick(label, selector))) return;
  }

  // 元の表記に業者名が入っていない場合に限り、共通部分での一致を許す。
  // 該当が2つ以上あるときは、どちらか分からないので選ばない。
  if (!/[（(]/.test(value)) {
    const matches = entries.filter(([label]) => {
      const base = label.replace(/[（(].*/, '').trim();
      return base && value.includes(base);
    });
    if (matches.length === 1 && (await tick(matches[0][0], matches[0][1]))) return;
  }

  log.warn(`配送方法「${value}」に合うものが特定できませんでした。手動確認が必要です。`);
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
