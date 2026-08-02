/**
 * 操作画面。依存を増やしたくないので、HTML/CSS/JSを1ファイルで返す。
 * サーバーは状態をJSONで返すだけで、描画は全部ブラウザ側でやる。
 */
export function renderPage() {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yahoo!フリマ 自動再出品</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --sub:#666; --line:#e3e3e3; --card:#fafafa; --accent:#2563eb; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16181c; --fg:#eee; --sub:#9aa0a6; --line:#2f333a; --card:#1e2126; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px; background:var(--bg); color:var(--fg); line-height:1.7;
    font-family:-apple-system,"Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif; }
  .wrap { max-width: 780px; margin: 0 auto; }
  h1 { font-size:20px; margin:0 0 2px; }
  .sub { color:var(--sub); font-size:13px; margin-bottom:20px; }
  .card { border:1px solid var(--line); background:var(--card); border-radius:12px; padding:16px; margin-bottom:14px; }
  .card h2 { font-size:15px; margin:0 0 10px; display:flex; align-items:center; gap:8px; }
  .num { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px;
    border-radius:50%; background:var(--accent); color:#fff; font-size:12px; flex:none; }
  .done .num { background:#16a34a; }
  .done h2::after { content:"完了"; font-size:11px; color:#16a34a; border:1px solid #16a34a;
    border-radius:99px; padding:0 8px; font-weight:400; }
  p.help { color:var(--sub); font-size:13px; margin:0 0 12px; }
  button { font:inherit; font-size:14px; padding:9px 18px; border-radius:9px; border:1px solid var(--line);
    background:var(--bg); color:var(--fg); cursor:pointer; }
  button:hover:not(:disabled) { border-color:var(--accent); }
  button:disabled { opacity:.45; cursor:not-allowed; }
  button.primary { background:var(--accent); color:#fff; border-color:var(--accent); }
  button.danger { background:#dc2626; color:#fff; border-color:#dc2626; }
  button.small { padding:4px 12px; font-size:13px; }
  input[type=text], input[type=number] { font:inherit; font-size:14px; padding:8px 10px; border-radius:8px;
    border:1px solid var(--line); background:var(--bg); color:var(--fg); }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .modes { display:flex; flex-direction:column; gap:8px; }
  .mode { display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border:1px solid var(--line);
    border-radius:9px; cursor:pointer; background:var(--bg); }
  .mode.on { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent); }
  .mode b { font-size:14px; } .mode small { color:var(--sub); display:block; font-size:12px; line-height:1.5; }
  table { width:100%; border-collapse:collapse; }
  td { border-top:1px solid var(--line); padding:11px 4px; vertical-align:top; font-size:14px; }
  tr:first-child td { border-top:none; }
  .badge { display:inline-block; padding:1px 9px; border-radius:99px; background:var(--line); font-size:11px; white-space:nowrap; }
  .b-pending_approval { background:#fde68a; color:#78350f; }
  .b-error { background:#fecaca; color:#7f1d1d; }
  .b-out_of_stock { background:#ddd6fe; color:#4c1d95; }
  .b-listed { background:#bbf7d0; color:#14532d; }
  .meta { color:var(--sub); font-size:12px; }
  .err { color:#dc2626; font-size:12px; }
  #log { background:#0f1115; color:#c9d1d9; font-family:ui-monospace,Menlo,Consolas,monospace;
    font-size:12px; line-height:1.6; padding:12px; border-radius:9px; height:220px; overflow-y:auto; white-space:pre-wrap; }
  #log .ERROR { color:#ff7b72; } #log .WARN { color:#e3b341; } #log .t { color:#6e7681; }
  .banner { padding:11px 14px; border-radius:9px; margin-bottom:14px; font-size:14px; }
  .banner.stop { background:#dc2626; color:#fff; }
  .banner.info { background:#dbeafe; color:#1e3a8a; }
  .banner.warn { background:#fef3c7; color:#78350f; }
  .foot { color:var(--sub); font-size:12px; text-align:center; margin:22px 0 8px; }
  .hidden { display:none; }
</style></head><body><div class="wrap">

<h1>Yahoo!フリマ 自動再出品</h1>
<div class="sub">売れた商品を、同じ内容でもう一度出品します。この画面はあなたのパソコンの中だけで動いています。</div>

<div id="banners"></div>

<div class="card" id="c-login">
  <h2><span class="num">1</span>Yahoo!フリマにログイン</h2>
  <p class="help">ボタンを押すとブラウザが開きます。いつもどおりご自分でログインしてください。パスワードがこのアプリに渡ることはありません。</p>
  <div class="row">
    <button class="primary" id="btn-login">ログイン用のブラウザを開く</button>
    <button class="primary hidden" id="btn-login-done">ログインできた</button>
    <button class="hidden" id="btn-login-cancel">やめる</button>
  </div>
</div>

<div class="card" id="c-inspect">
  <h2><span class="num">2</span>画面のつくりを調べる</h2>
  <p class="help">Yahoo!フリマの画面のつくりを自動で調べます。ブラウザが勝手に開いたり閉じたりしますが、触らずに待ってください。1〜2分で終わります。</p>
  <div class="row">
    <button id="btn-inspect">調べる</button>
    <span class="meta" id="inspect-note"></span>
  </div>
</div>

<div class="card" id="c-track">
  <h2><span class="num">3</span>見張る商品を登録</h2>
  <p class="help">今出品している商品を登録します。このとき写真や説明文を保存するので、売れて商品ページが消えても再出品できます。</p>
  <div class="row" style="margin-bottom:10px">
    <button id="btn-track-all">出品中の商品をまとめて登録</button>
  </div>
  <div class="row">
    <input type="text" id="track-url" placeholder="商品のURLを貼って1つだけ登録" style="flex:1;min-width:220px">
    <input type="text" id="track-stock" placeholder="在庫" size="4" style="width:70px">
    <button id="btn-track-one">登録</button>
  </div>
  <p class="help" style="margin:8px 0 0">在庫は空欄でOKです（無制限＝売れるたびにずっと再出品します）。</p>
</div>

<div class="card" id="c-mode">
  <h2><span class="num">4</span>動き方を選ぶ</h2>
  <div class="modes">
    <label class="mode" data-mode="try"><input type="radio" name="mode" value="try">
      <span><b>お試し（まずはこれ）</b><small>売れたのを見つけて、出品画面に入力するところまでやって止まります。実際には出品されません。</small></span></label>
    <label class="mode" data-mode="semi"><input type="radio" name="mode" value="semi">
      <span><b>半自動</b><small>売れたら下に出てくるボタンを押すと、そこで初めて出品します。</small></span></label>
    <label class="mode" data-mode="auto"><input type="radio" name="mode" value="auto">
      <span><b>完全自動</b><small>売れたら確認なしでそのまま出品します。慣れてからにしてください。</small></span></label>
  </div>
  <div class="row" style="margin-top:12px">
    <span class="meta">何分おきに確認するか</span>
    <input type="number" id="poll" min="10" step="5" style="width:80px"> <span class="meta">分（10分以上）</span>
    <button class="small" id="btn-poll">変更</button>
  </div>
</div>

<div class="card" id="c-watch">
  <h2><span class="num">5</span>見張りを始める</h2>
  <p class="help" id="watch-note">開始するとこの画面を閉じてもパソコンの中で動き続けます。止めたいときは「停止」を押してください。</p>
  <div class="row">
    <button class="primary" id="btn-watch">見張りを始める</button>
    <span class="meta" id="next-check"></span>
  </div>
</div>

<div class="card">
  <h2>商品の状況</h2>
  <table id="items"></table>
</div>

<div class="card">
  <h2>動作の記録</h2>
  <div id="log"></div>
</div>

<div class="card">
  <h2>緊急停止</h2>
  <p class="help">おかしいと思ったらすぐ押してください。すべての動作が止まります。</p>
  <button class="danger" id="btn-stop">緊急停止</button>
</div>

<div class="foot">この画面はあなたのパソコンの中だけで動いています（外部には公開されていません）</div>
</div>

<script>
const $ = (id) => document.getElementById(id);
let latest = null;

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) alert(data.error || 'エラーが起きました');
  refresh();
  return res.ok;
}

const STATUS = {
  listed: '見張り中', sold: '売れました', pending_approval: '確認してください',
  relisting: '出品中…', relisted: '再出品しました', error: 'エラー',
  archived: '終了', out_of_stock: '在庫切れ',
};

function modeOf(c) { return c.dryRun ? 'try' : c.autoApprove ? 'auto' : 'semi'; }

function renderItems(items) {
  const table = $('items');
  table.textContent = '';
  const active = items.filter((i) => i.status !== 'archived');
  if (!active.length) {
    const tr = table.insertRow();
    tr.insertCell().innerHTML = '<span class="meta">まだ登録されていません。上の「3」で登録してください。</span>';
    return;
  }
  const rank = (i) => (i.status === 'pending_approval' ? 0 : i.status === 'error' ? 1 : i.status === 'out_of_stock' ? 2 : 3);
  for (const item of active.sort((a, b) => rank(a) - rank(b))) {
    const tr = table.insertRow();

    const c1 = tr.insertCell();
    const badge = document.createElement('span');
    badge.className = 'badge b-' + item.status;
    badge.textContent = STATUS[item.status] || item.status;
    c1.appendChild(badge);

    const c2 = tr.insertCell();
    const title = document.createElement('div');
    title.textContent = item.title || '(名前がとれていません)';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = (item.price ? '¥' + item.price.toLocaleString() : '価格不明')
      + '・写真' + item.images + '枚・在庫' + (item.stock === null ? '無制限' : item.stock);
    c2.append(title, meta);
    if (item.lastError) {
      const err = document.createElement('div');
      err.className = 'err';
      err.textContent = item.lastError;
      c2.appendChild(err);
    }

    const c3 = tr.insertCell();
    c3.style.textAlign = 'right';
    c3.style.whiteSpace = 'nowrap';
    if (item.status === 'pending_approval' || item.status === 'error') {
      const go = document.createElement('button');
      go.className = 'primary small';
      go.textContent = 'この内容で出品';
      go.onclick = () => { go.disabled = true; go.textContent = '処理中…'; api('/api/relist', { itemId: item.itemId }); };
      const skip = document.createElement('button');
      skip.className = 'small';
      skip.style.marginLeft = '6px';
      skip.textContent = '出さない';
      skip.onclick = () => api('/api/skip', { itemId: item.itemId });
      c3.append(go, skip);
    }
    const stock = document.createElement('button');
    stock.className = 'small';
    stock.style.marginLeft = '6px';
    stock.textContent = '在庫';
    stock.onclick = () => {
      const value = prompt('在庫の数を入れてください（無制限にするなら none）', item.stock === null ? 'none' : item.stock);
      if (value !== null) api('/api/stock', { itemId: item.itemId, stock: value.trim() });
    };
    c3.appendChild(stock);
  }
}

function renderLogs(logs) {
  const box = $('log');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.textContent = '';
  for (const entry of logs) {
    const line = document.createElement('div');
    line.className = entry.level;
    const time = document.createElement('span');
    time.className = 't';
    time.textContent = entry.time + '  ';
    line.append(time, document.createTextNode(entry.message));
    box.appendChild(line);
  }
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function render(s) {
  latest = s;

  // バナー
  const banners = $('banners');
  banners.textContent = '';
  const add = (cls, text) => {
    const div = document.createElement('div');
    div.className = 'banner ' + cls;
    div.textContent = text;
    banners.appendChild(div);
  };
  if (s.stopped) add('stop', '緊急停止中です。下の「解除」を押すまで何も動きません。');
  if (s.job) add('info', '「' + s.job.name + '」を実行中です。終わるまでお待ちください。');
  if (s.config.dryRun && s.watching) add('warn', 'お試しモードです。売れても実際には出品されません。');

  // 1. ログイン
  $('c-login').classList.toggle('done', s.loggedIn && !s.loginOpen);
  $('btn-login').classList.toggle('hidden', s.loginOpen);
  $('btn-login').textContent = s.loggedIn ? 'ログインしなおす' : 'ログイン用のブラウザを開く';
  $('btn-login-done').classList.toggle('hidden', !s.loginOpen);
  $('btn-login-cancel').classList.toggle('hidden', !s.loginOpen);

  // 2. 調査
  $('c-inspect').classList.toggle('done', s.inspected);
  $('btn-inspect').disabled = !s.loggedIn || !!s.job;
  $('inspect-note').textContent = !s.loggedIn ? '先に1のログインをしてください'
    : s.inspected ? '調べ終わっています' : '';

  // 3. 登録
  const tracked = s.items.filter((i) => i.status !== 'archived').length;
  $('c-track').classList.toggle('done', tracked > 0);
  $('btn-track-all').disabled = !s.loggedIn || !!s.job;
  $('btn-track-one').disabled = !s.loggedIn || !!s.job;

  // 4. モード
  const mode = modeOf(s.config);
  for (const label of document.querySelectorAll('.mode')) {
    const on = label.dataset.mode === mode;
    label.classList.toggle('on', on);
    label.querySelector('input').checked = on;
  }
  if (document.activeElement !== $('poll')) $('poll').value = s.config.pollIntervalMinutes;

  // 5. 監視
  $('c-watch').classList.toggle('done', s.watching);
  const btn = $('btn-watch');
  btn.textContent = s.watching ? '停止する' : '見張りを始める';
  btn.className = s.watching ? 'danger' : 'primary';
  btn.disabled = !s.loggedIn;
  $('next-check').textContent = s.watching && s.nextCheckAt
    ? '次の確認: ' + new Date(s.nextCheckAt).toLocaleTimeString('ja-JP')
    : s.watching ? '確認中…' : '';
  $('watch-note').textContent = s.loggedIn
    ? '開始するとこの画面を閉じてもパソコンの中で動き続けます。止めたいときは「停止する」を押してください。'
    : '先に1のログインをしてください。';

  $('btn-stop').textContent = s.stopped ? '緊急停止を解除' : '緊急停止';

  renderItems(s.items);
  renderLogs(s.logs);
}

async function refresh() {
  try {
    render(await (await fetch('/api/status')).json());
  } catch { /* サーバーが止まっているときは次回に期待する */ }
}

$('btn-login').onclick = () => api('/api/login/open');
$('btn-login-done').onclick = () => api('/api/login/done');
$('btn-login-cancel').onclick = () => api('/api/login/cancel');
$('btn-inspect').onclick = () => api('/api/inspect');
$('btn-track-all').onclick = () => api('/api/track-all');
$('btn-track-one').onclick = () => {
  const url = $('track-url').value.trim();
  if (!url) return alert('商品のURLを入れてください。');
  api('/api/track-one', { url, stock: $('track-stock').value.trim() });
  $('track-url').value = '';
  $('track-stock').value = '';
};
$('btn-poll').onclick = () => api('/api/settings', { pollIntervalMinutes: $('poll').value });
$('btn-watch').onclick = () => api(latest?.watching ? '/api/watch/stop' : '/api/watch/start');
$('btn-stop').onclick = () => {
  if (latest?.stopped) return api('/api/emergency-stop', { on: 'false' });
  if (confirm('すべての動作を止めます。よろしいですか？')) api('/api/emergency-stop', { on: 'true' });
};
for (const label of document.querySelectorAll('.mode')) {
  label.onclick = () => {
    const mode = label.dataset.mode;
    if (mode === 'auto' && !confirm('完全自動にすると、売れたときに確認なしで出品します。よろしいですか？')) return;
    api('/api/settings', { dryRun: String(mode === 'try'), autoApprove: String(mode === 'auto') });
  };
}

refresh();
setInterval(refresh, 3000);
</script></body></html>`;
}
