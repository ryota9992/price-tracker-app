import fs from 'node:fs';
import { chromium } from 'playwright';
import { AUTH_FILE, ensureDirs } from './config.js';
import { log } from './logger.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function hasAuth() {
  return fs.existsSync(AUTH_FILE);
}

export async function launch(config, { headless = config.headless, useAuth = true } = {}) {
  ensureDirs();
  const browser = await chromium.launch({
    headless,
    channel: config.browserChannel || undefined,
    executablePath: config.browserExecutablePath || undefined,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    storageState: useAuth && hasAuth() ? AUTH_FILE : undefined,
    userAgent: USER_AGENT,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
  });
  context.setDefaultTimeout(30000);
  return { browser, context };
}

export async function saveAuth(context) {
  await context.storageState({ path: AUTH_FILE });
  log.info('ログイン情報を保存しました:', AUTH_FILE);
}

/** 人間らしい間隔を空ける。連続アクセスでの負荷とBOT判定の両方を避けるため。 */
export function pace(config) {
  const base = config.minSecondsBetweenActions * 1000;
  const ms = base + Math.random() * base * 0.5;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 候補セレクタを順に試し、最初に見つかった Locator を返す。 */
export async function findFirst(scope, candidates, { timeout = 5000 } = {}) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  for (const selector of list) {
    const locator = scope.locator(selector).first();
    try {
      await locator.waitFor({ state: 'attached', timeout: timeout / list.length });
      return locator;
    } catch {
      continue;
    }
  }
  return null;
}

export async function textOf(scope, candidates) {
  const locator = await findFirst(scope, candidates, { timeout: 3000 });
  if (!locator) return '';
  return (await locator.innerText().catch(() => '')).trim();
}
