import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startMock, state as mock } from './mock-site.mjs';

const BOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_PORT = 8901;
const UI_PORT = 8902;

const selectors = JSON.parse(fs.readFileSync(path.join(BOT, 'selectors.json'), 'utf8'));
selectors.baseUrl = `http://127.0.0.1:${MOCK_PORT}`;
selectors.urls.myListings = ['/mypage/listing'];
selectors.urls.sell = '/sell'; // 本番は別ドメインの絶対URLなので、モック向けに戻す
delete selectors._README;

if (fs.existsSync(path.join(BOT, 'data/state.json')) && !process.env.FORCE && process.env.npm_lifecycle_event !== 'test') {
  console.error('data/state.json が既にあります。テストはこれを消します。実行するなら FORCE=1 を付けてください。');
  process.exit(1);
}
fs.rmSync(path.join(BOT, 'data'), { recursive: true, force: true });
fs.mkdirSync(path.join(BOT, 'data/inspect'), { recursive: true });
fs.writeFileSync(path.join(BOT, 'data/auth.json'), JSON.stringify({ cookies: [], origins: [] }));

// 設定変更でconfigは毎回ファイルから読み直されるので、テスト用の値もファイルに書いておく
const cfgFile = path.join(BOT, 'config.json');
const cfgRaw = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
cfgRaw.headless = true;
cfgRaw.minSecondsBetweenActions = 0;
// 開発コンテナなど、同梱ブラウザのパスが違う環境向けの逃げ道
if (process.env.CHROMIUM_PATH) cfgRaw.browserExecutablePath = process.env.CHROMIUM_PATH;
cfgRaw.uiPort = UI_PORT;
fs.writeFileSync(cfgFile, JSON.stringify(cfgRaw, null, 2));

const { loadConfig } = await import(`${BOT}/src/config.js`);
const { startServer } = await import(`${BOT}/src/server.js`);
const config = { ...loadConfig(), uiPort: UI_PORT, dryRun: true, autoApprove: false };

const mockServer = await startMock(MOCK_PORT);
const uiServer = startServer(config, selectors);
await new Promise((r) => setTimeout(r, 500));

const browser = await chromium.launch({
  headless: true,
  executablePath: config.browserExecutablePath || undefined,
});
const page = await browser.newPage();
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 進行中のジョブが終わるまで待つ（処理時間はマシン次第なので固定待ちにしない）
async function waitForJob(timeout = 60000) {
  const until = Date.now() + timeout;
  await wait(500);
  while (Date.now() < until) {
    const s = await (await fetch(`http://127.0.0.1:${UI_PORT}/api/status`)).json();
    if (!s.job) { await wait(3600); return; } // 画面の再描画(3秒間隔)を待つ
    await wait(400);
  }
  throw new Error('ジョブが時間内に終わりませんでした');
}

page.on('pageerror', (e) => console.log('  !! JSエラー:', e.message));

try {
  await page.goto(`http://127.0.0.1:${UI_PORT}/`);
  await wait(1000);

  check('画面が開く', (await page.title()).includes('Yahoo!フリマ'));
  check('ログイン済みなので1が完了表示', await page.locator('#c-login.done').count() === 1);
  check('ステップ2のボタンが押せる', !(await page.locator('#btn-inspect').isDisabled()));

  // 3. 商品登録をUIから
  await page.click('#btn-track-all');
  await waitForJob();
  const rows = await page.locator('#items tr').count();
  check('UIから商品を登録できる', rows === 2, `→ ${rows}行`);
  check('登録後ステップ3が完了表示', await page.locator('#c-track.done').count() === 1);

  // 4. モード切替（お試し → 半自動）
  await page.click('.mode[data-mode="semi"]');
  await wait(800);
  const saved = JSON.parse(fs.readFileSync(path.join(BOT, 'config.json'), 'utf8'));
  check('モード変更がconfig.jsonに保存される', saved.dryRun === false && saved.autoApprove === false);
  check('選択中のモードが画面に反映される', await page.locator('.mode[data-mode="semi"].on').count() === 1);
  check('設定の_コメントが消えていない', '_dryRun' in saved);

  // チェック間隔
  await page.fill('#poll', '30');
  await page.click('#btn-poll');
  await wait(600);
  check('チェック間隔を変更できる',
    JSON.parse(fs.readFileSync(path.join(BOT, 'config.json'), 'utf8')).pollIntervalMinutes === 30);

  // 10分未満は拒否
  page.once('dialog', (d) => d.accept());
  await page.fill('#poll', '2');
  await page.click('#btn-poll');
  await wait(600);
  check('10分未満は拒否される',
    JSON.parse(fs.readFileSync(path.join(BOT, 'config.json'), 'utf8')).pollIntervalMinutes === 30);

  // 5. 監視の開始と停止
  await page.click('#btn-watch');
  await wait(3000);
  check('監視を開始できる', await page.locator('#btn-watch').textContent() === '停止する');

  // 売れた状態にして、承認待ちがUIに出るか
  mock.sold = true;
  await wait(1000);
  const { checkOnce } = await import(`${BOT}/src/relist.js`);
  await checkOnce({ ...config, dryRun: false }, selectors);
  await wait(3500);
  check('売れると「確認してください」が出る',
    (await page.locator('#items').textContent()).includes('確認してください'));
  check('出品ボタンが出る', await page.locator('#items button:has-text("この内容で出品")').count() === 1);

  // 承認ボタンで実出品
  await page.click('#items button:has-text("この内容で出品")');
  await waitForJob();
  check('UIのボタンから再出品できる', mock.created === 'new999');

  await page.click('#btn-watch');
  await wait(1500);
  check('監視を停止できる', await page.locator('#btn-watch').textContent() === '見張りを始める');

  // 緊急停止
  page.once('dialog', (d) => d.accept());
  await page.click('#btn-stop');
  await wait(1200);
  check('緊急停止が効く', fs.existsSync(path.join(BOT, 'data/STOP')));
  check('緊急停止バナーが出る', (await page.locator('#banners').textContent()).includes('緊急停止中'));
  await page.click('#btn-stop');
  await wait(1200);
  check('緊急停止を解除できる', !fs.existsSync(path.join(BOT, 'data/STOP')));

  // ログ表示
  check('動作の記録が表示される', (await page.locator('#log').textContent()).length > 50);

  // XSS: 商品名にタグが入っても実行されない
  const store = await import(`${BOT}/src/store.js`);
  store.update((s) => { s.items.aaa111.snapshot.title = '<img src=x onerror="window.__xss=1">'; s.items.aaa111.status = 'listed'; });
  await wait(3500);
  check('商品名のHTMLが実行されない', await page.evaluate(() => window.__xss === undefined));
  check('商品名はそのまま文字として出る',
    (await page.locator('#items').textContent()).includes('<img src=x'));
} finally {
  await browser.close();
  uiServer.close();
  mockServer.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
