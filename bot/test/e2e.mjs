import fs from 'node:fs';
import path from 'node:path';
import { startMock, state as mock } from './mock-site.mjs';

import { fileURLToPath } from 'node:url';

const BOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8899;

// テスト用に selectors.json をモックサイト向けへ差し替える
const selectors = JSON.parse(fs.readFileSync(path.join(BOT, 'selectors.json'), 'utf8'));
selectors.baseUrl = `http://127.0.0.1:${PORT}`;
selectors.urls.myListings = ['/mypage/listing'];
selectors.urls.soldListings = ['/mypage/sold'];
selectors.urls.sell = '/sell'; // 本番は別ドメインの絶対URLなので、モック向けに戻す
fs.writeFileSync(path.join(BOT, 'selectors.test.json'), JSON.stringify(selectors));

// 本物の data/ を壊さないよう、テスト前に警告を出す
if (fs.existsSync(path.join(BOT, 'data/state.json')) && !process.env.FORCE && process.env.npm_lifecycle_event !== 'test') {
  console.error('data/state.json が既にあります。テストはこれを消します。実行するなら FORCE=1 を付けてください。');
  process.exit(1);
}

// data/ をきれいにしてから
fs.rmSync(path.join(BOT, 'data/state.json'), { force: true });
fs.rmSync(path.join(BOT, 'data/images'), { recursive: true, force: true });
fs.mkdirSync(path.join(BOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(BOT, 'data/auth.json'), JSON.stringify({ cookies: [], origins: [] }));

const { loadConfig, loadSelectors } = await import(`${BOT}/src/config.js`);
const { trackItems, checkOnce, executeRelist } = await import(`${BOT}/src/relist.js`);
const store = await import(`${BOT}/src/store.js`);

// 開発コンテナなど、同梱ブラウザのパスが違う環境向けの逃げ道
const browserExecutablePath = process.env.CHROMIUM_PATH || loadConfig().browserExecutablePath || '';
const config = { ...loadConfig(), browserExecutablePath, headless: true, minSecondsBetweenActions: 0, dryRun: true, autoApprove: false };
const sel = JSON.parse(fs.readFileSync(path.join(BOT, 'selectors.test.json'), 'utf8'));
delete sel._README;

const server = await startMock(PORT);
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
};

try {
  // 1. 監視登録（スナップショット + 画像保存）
  const added = await trackItems(config, sel, { all: true });
  check('track --all で出品中2件を登録', added.length === 2, `→ ${added.length}件`);
  const snap = store.load().items.aaa111.snapshot;
  check('タイトル取得', snap.title === 'ダミー商品A 完全版', `→ "${snap.title}"`);
  check('価格取得', snap.price === 3480, `→ ${snap.price}`);
  check('説明取得', snap.description.includes('テスト用の商品説明'), `→ "${snap.description.slice(0, 20)}"`);
  check('商品の状態取得', snap.condition === '目立った傷や汚れなし', `→ "${snap.condition}"`);
  check('配送の方法取得', snap.shippingMethod === 'おてがる配送', `→ "${snap.shippingMethod}"`);
  check('自分の商品写真2枚だけを保存', snap.images.length === 2 && snap.images.every((f) => fs.existsSync(f)),
    `→ ${snap.images.length}枚`);
  check('おすすめ枠の他人の写真を拾わない',
    !JSON.stringify(snap.images).includes('auc-pctr') && !JSON.stringify(snap.images).includes('auc-product'));

  // 2. まだ売れていないので何も起きない
  const idle = await checkOnce(config, sel);
  check('未売却なら再出品ジョブは作らない', (idle.detected || []).length === 0);

  // 3. 売れた → 半自動なので承認待ちになるだけ
  mock.sold = true;
  const detected = await checkOnce(config, sel);
  check('売却を検知', detected.detected?.includes('aaa111'));
  check('半自動では承認待ちで止まる', store.load().items.aaa111.status === 'pending_approval',
    `→ ${store.load().items.aaa111.status}`);

  // 4. dryRun で再出品 → 実際には出品されない
  await executeRelist(config, sel, 'aaa111');
  check('dryRunでは実出品しない', mock.created === null && store.load().items.aaa111.status === 'pending_approval');
  check('dryRunの確認スクショが残る', fs.existsSync(store.load().items.aaa111.dryRunScreenshot || ''));

  // 5. 本番モードで再出品
  const live = { ...config, dryRun: false };
  await executeRelist(live, sel, 'aaa111');
  const after = store.load();
  check('新規出品が作られた', mock.created === 'new999');
  check('元商品はarchivedになる', after.items.aaa111.status === 'archived', `→ ${after.items.aaa111.status}`);
  check('新商品が自動で監視対象になる', after.items.new999?.status === 'listed');
  check('新商品にスナップショットが引き継がれる', after.items.new999?.snapshot.title === 'ダミー商品A 完全版');
  check('再出品ログが記録される', after.relistLog.length === 1 && store.relistsToday(after) === 1);

  // 6. 完全自動モード: 検知から出品まで一気に走る
  mock.created = null;
  mock.sold = true;
  store.update((s) => { s.items.aaa111.status = 'listed'; });
  const auto = { ...config, dryRun: false, autoApprove: true };
  await checkOnce(auto, sel);
  check('完全自動では承認なしで再出品まで走る', mock.created === 'new999');

  // 7. 1日上限のブレーキ
  const capped = { ...auto, maxRelistsPerDay: 1 };
  store.update((s) => { s.items.aaa111.status = 'pending_approval'; });
  let blocked = false;
  await executeRelist(capped, sel, 'aaa111').catch((e) => (blocked = /上限/.test(e.message)));
  check('1日上限を超えたら止まる', blocked);

  // 8. キルスイッチ
  fs.writeFileSync(`${BOT}/data/STOP`, '');
  const stopped = await checkOnce(auto, sel);
  check('STOPファイルで停止する', stopped.skipped === 'stop');
  fs.rmSync(`${BOT}/data/STOP`);

  // 9. 稼働時間外
  const night = { ...config, activeHours: { from: 3, to: 4 } };
  const outside = await checkOnce(night, sel);
  check('稼働時間外はスキップ', outside.skipped === 'hours');

  // 10. 在庫管理（オプトイン）
  check('在庫未設定はnull＝無制限のまま', store.load().items.bbb222.stock === null);

  // 在庫2でリセットし、売れるたびに減っていくのを見る
  mock.created = null;
  store.update((s) => {
    s.items.aaa111.status = 'listed';
    s.items.aaa111.stock = 2;
    delete s.items.new999;
    s.relistLog = [];
  });
  mock.sold = true;

  await checkOnce(auto, sel);
  const afterFirst = store.load();
  check('売れたら在庫が1減る', afterFirst.items.aaa111.stock === 1, `→ ${afterFirst.items.aaa111.stock}`);
  check('在庫が残っていれば再出品する', mock.created === 'new999');
  check('残り在庫が新商品に引き継がれる', afterFirst.items.new999?.stock === 1,
    `→ ${afterFirst.items.new999?.stock}`);

  // 最後の1つが売れる → 在庫0なので再出品しない
  mock.created = null;
  mock.sold = true;
  store.update((s) => {
    s.items.aaa111.status = 'listed'; // モックはaaa111だけを売却済みにするため
    s.items.aaa111.stock = 1;
  });
  await checkOnce(auto, sel);
  const afterLast = store.load();
  check('在庫0になったら再出品しない', mock.created === null);
  check('在庫切れステータスになる', afterLast.items.aaa111.status === 'out_of_stock',
    `→ ${afterLast.items.aaa111.status}`);

  // 補充したら監視に戻る
  store.update((s) => {
    s.items.aaa111.stock = 3;
    if (s.items.aaa111.status === 'out_of_stock') s.items.aaa111.status = 'listed';
  });
  await checkOnce(auto, sel);
  check('在庫を補充すると再出品が再開する', mock.created === 'new999');
  check('補充後は在庫が減って続く', store.load().items.aaa111.stock === 2,
    `→ ${store.load().items.aaa111.stock}`);
} finally {
  server.close();
  fs.rmSync(path.join(BOT, 'selectors.test.json'), { force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
