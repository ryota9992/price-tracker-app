import http from 'node:http';
import crypto from 'node:crypto';

// 売れた状態を切り替えられるモックサイト
export const state = { sold: false, created: null };

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
      return html(
        res,
        page(`<main>
          <h1>ダミー商品A 完全版</h1>
          <div class="price">¥3,480</div>
          <img src="/images.auctions.yahoo.co.jp/image/dr000/auc0208/users/abc123/i-img1171x1200-1.jpg">
          <img src="/images.auctions.yahoo.co.jp/image/dr000/auc0208/users/abc123/i-img1171x1200-2.jpg">
          <!-- 「この商品をみている人にオススメ」の他人の写真。絶対に拾ってはいけない -->
          <img src="/auc-pctr/i/images.auctions.yahoo.co.jp/image/dr000/auc0208/users/xxx/i-img600x600-9.jpg?pri=l">
          <!-- 商品カタログの写真。/users/ を含まないので対象外 -->
          <img src="/images.auctions.yahoo.co.jp/image/dr000/auc-product/product/0/948902003a.jpg">
          <div class="description">これはテスト用の商品説明です。\n改行も含みます。</div>
          <dl>
            <dt>商品の状態</dt><dd>目立った傷や汚れなし</dd>
            <dt>配送料の負担</dt><dd>送料込み（出品者負担）</dd>
            <dt>配送の方法</dt><dd>おてがる配送</dd>
            <dt>発送元</dt><dd>東京都</dd>
            <dt>発送までの日数</dt><dd>1〜2日で発送</dd>
          </dl>
        </main>`)
      );
    }

    if (url.pathname === '/sell') {
      return html(
        res,
        page(`<form method="POST" action="/sell/submit" enctype="multipart/form-data">
          <input type="file" name="photos" multiple>
          <input name="title" placeholder="商品名">
          <textarea name="description" placeholder="説明"></textarea>
          <input name="price" placeholder="価格">
          <button type="submit">出品する</button>
        </form>`)
      );
    }

    if (url.pathname === '/sell/submit') {
      state.created = 'new999';
      state.sold = false;
      res.writeHead(303, { Location: '/item/new999?done=1' });
      return res.end();
    }

    res.writeHead(404).end('nope');
  });

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function html(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}
