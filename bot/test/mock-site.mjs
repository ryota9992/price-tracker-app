import http from 'node:http';
import crypto from 'node:crypto';

// 売れた状態を切り替えられるモックサイト
export const state = { sold: false, created: null, copySupported: false, lastSubmit: '' };

const IMG = crypto.randomBytes(20000);

const page = (body) => `<!doctype html><meta charset="utf-8"><body>
<header><a href="/mypage">マイページ</a></header>${body}</body>`;

export function startMock(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');

    // 本番のCDNと同じ形のパスにしておかないと、画像セレクタを検証したことにならない
    if (url.pathname.includes('/image/')) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return res.end(IMG);
    }

    if (url.pathname === '/') return html(res, page('<h1>トップ</h1>'));

    // 本番と同じく、出品中と売却済みでページを分ける
    if (url.pathname === '/mypage/listing') {
      const selling = [];
      if (!state.sold) selling.push('aaa111');
      selling.push('bbb222');
      if (state.created) selling.push(state.created);
      return html(
        res,
        page(`<nav id="tab"><a href="/mypage/listing">出品中</a><a href="/mypage/sold">売却済み</a></nav>
        <ul>${selling
          .map((id) => `<li><a href="/item/${id}"><span class="title">ダミー商品</span></a></li>`)
          .join('')}</ul>`)
      );
    }

    if (url.pathname === '/mypage/sold') {
      return html(
        res,
        page(`<nav id="tab"><a href="/mypage/listing">出品中</a><a href="/mypage/sold">売却済み</a></nav>
        <ul>${state.sold ? '<li><a href="/item/aaa111"><span class="title">ダミー商品A</span></a></li>' : ''}</ul>`)
      );
    }

    if (url.pathname.startsWith('/item/')) {
      // 本番と同じ構造にする: 見出し + タブ区切りのラベル/値、説明は「もっと読む」で省略
      const expanded = url.searchParams.get('more') === '1';
      return html(
        res,
        page(`<main>
          <h1 class="ItemTitle__Component">ダミー商品A 完全版</h1>
          <div class="price">¥3,480</div>
          <img src="/images.auctions.yahoo.co.jp/image/dr000/auc0208/users/abc123/i-img1171x1200-1.jpg">
          <img src="/images.auctions.yahoo.co.jp/image/dr000/auc0208/users/abc123/i-img1171x1200-2.jpg">
          <img src="/auc-pctr/i/images.auctions.yahoo.co.jp/image/dr000/auc0208/users/xxx/i-img600x600-9.jpg?pri=l">
          <img src="/images.auctions.yahoo.co.jp/image/dr000/auc-product/product/0/948902003a.jpg">
          <a href="/category/2502">スマホ、タブレット、パソコン</a>
          <a href="/category/2502/36496">ウェアラブル端末</a>
          <div>
            <h3>商品説明</h3>
            <div><div>これはテスト用の商品説明です。</div>${expanded ? '<div>最後まで読んだ場合だけ見える行です。</div>' : '<div>もっと読む</div>'}<div>公開日時：2026年8月3日 05:29</div><div>1日前に更新</div></div>
          </div>
          <div>
            <h3>商品の情報</h3>
            <table><tbody>
              <tr><td>カテゴリ</td><td>スマホ、タブレット、パソコン</td></tr>
              <tr><td>商品の状態</td><td>目立った傷や汚れなし</td></tr>
              <tr><td>配送の方法</td><td>おてがる配送（日本郵便）</td></tr>
              <tr><td>発送までの日数</td><td>1〜2日で発送</td></tr>
              <tr><td>発送元の地域</td><td>神奈川県</td></tr>
              <tr><td>商品ID</td><td>aaa111</td></tr>
            </tbody></table>
          </div>
          ${expanded ? '' : '<button onclick="location.search=\'?more=1\'">もっと読む</button>'}
        </main>`)
      );
    }

    if (url.pathname === '/sell') {
      // copyItemId 付きで開かれ、対応している設定なら中身が復元された状態にする
      const copied = state.copySupported && url.searchParams.get('copyItemId');
      return html(
        res,
        page(`<form method="POST" action="/sell/submit" enctype="multipart/form-data">
          <input type="file" name="photos" multiple>
          <input name="title" placeholder="商品名"${copied ? ' value="ダミー商品A 完全版"' : ''}>
          <textarea name="description" placeholder="説明"></textarea>
          <input name="price" placeholder="価格">
          <select name="timeToShip"><option>選択してください（必須）</option><option>1~2日</option><option>2~3日</option><option>3~7日</option></select>
          <select name="prefectures"><option>選択してください（必須）</option><option>東京都</option><option>神奈川県</option></select>
          <label>おてがる配送（ヤマト運輸）<input type="radio" name="YAMATO" value="1"></label>
          <label>おてがる配送（日本郵便）<input type="radio" name="JAPAN_POST" value="1"></label>
          <button type="submit">出品する</button>
          <button type="button">下書きに保存する</button>
        </form>`)
      );
    }

    if (url.pathname === '/sell/submit') {
      // multipartの生データをそのまま控えておく。何が送信されたかを検証するため。
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      return req.on('end', () => {
        state.lastSubmit = body;
        state.created = 'new999';
        state.sold = false;
        res.writeHead(303, { Location: '/item/new999?done=1' });
        res.end();
      });
    }

    res.writeHead(404).end('nope');
  });

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function html(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}
