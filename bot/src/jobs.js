import fs from 'node:fs';
import path from 'node:path';
import { INSPECT_DIR, AUTH_FILE } from './config.js';
import { launch, saveAuth, hasAuth } from './browser.js';
import { runInspect } from './inspect.js';
import { trackItems } from './relist.js';
import { log } from './logger.js';

/**
 * 画面から実行される時間のかかる処理をまとめて管理する。
 * 同時に1つしか走らせない（ブラウザの取り合いを避けるため）。
 */
let current = null;
let loginSession = null;

export function currentJob() {
  return current ? { name: current.name, startedAt: current.startedAt } : null;
}

export function isLoginOpen() {
  return loginSession !== null;
}

export function jobStatus() {
  return {
    job: currentJob(),
    loginOpen: isLoginOpen(),
    loggedIn: hasAuth(),
    inspected: fs.existsSync(INSPECT_DIR) && fs.readdirSync(INSPECT_DIR).length > 0,
  };
}

function run(name, fn) {
  if (current) throw new Error(`「${current.name}」を実行中です。終わるまでお待ちください。`);
  current = { name, startedAt: new Date().toISOString() };
  log.info(`▶ ${name} を開始します`);

  // 画面をブロックしないよう非同期で走らせ、結果はログで知らせる
  Promise.resolve()
    .then(fn)
    .then(() => log.info(`✔ ${name} が完了しました`))
    .catch((error) => log.error(`✖ ${name} に失敗しました: ${error.message}`))
    .finally(() => {
      current = null;
    });
}

/** ログイン用のブラウザを開く。閉じずに保持し、ユーザーの「完了」を待つ。 */
export async function openLogin(config, selectors) {
  if (loginSession) throw new Error('すでにログイン用のブラウザが開いています。');
  // ログインは必ず画面を出して人間が行う（IDとパスワードはボットに渡さない）
  const { browser, context } = await launch(config, { headless: false, useAuth: false });
  const page = await context.newPage();
  await page.goto(selectors.baseUrl).catch(() => {});
  loginSession = { browser, context };
  log.info('ログイン用のブラウザを開きました。ログインしたら画面の「ログインできた」を押してください。');
}

export async function finishLogin() {
  if (!loginSession) throw new Error('ログイン用のブラウザが開いていません。');
  await saveAuth(loginSession.context);
  await loginSession.browser.close().catch(() => {});
  loginSession = null;
  log.info('ログイン情報を保存しました。');
}

export async function cancelLogin() {
  if (!loginSession) return;
  await loginSession.browser.close().catch(() => {});
  loginSession = null;
  log.info('ログインを中断しました。');
}

export function startInspect(config, selectors, itemId) {
  run('画面の調査', async () => {
    const { browser, context } = await launch(config, { headless: false });
    try {
      const page = await context.newPage();
      await runInspect(page, selectors, itemId);
    } finally {
      await browser.close().catch(() => {});
    }
  });
}

export function startTrackAll(config, selectors) {
  run('出品中の商品を登録', async () => {
    const added = await trackItems(config, selectors, { all: true });
    log.info(`${added.length} 件を監視対象に追加しました。`);
  });
}

export function startTrackOne(config, selectors, itemId, stock) {
  run('商品を登録', async () => {
    const added = await trackItems(config, selectors, { itemIds: [itemId], stock });
    log.info(`${added.length} 件を監視対象に追加しました。`);
  });
}

export function startJob(name, fn) {
  run(name, fn);
}

export function authFilePath() {
  return path.relative(process.cwd(), AUTH_FILE);
}
