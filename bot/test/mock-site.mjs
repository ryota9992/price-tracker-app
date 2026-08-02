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

    if (url.pathname.startsWith('/item-image/')) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return res.end(IMG);
    }

    if (url.pathname === '/') return html(res, page('<h1>トップ</h1>'));

    if (url.pathname === '/mypage/listing') {
      const badge = state.sold ? '<span class="sold">売却済み</span>' : '';
      return html(
        res,
        page(`<ul>
          <li><a href="/item/aaa111"><span class="title">ダミー商品A</span></a>${badge}<span class="price">¥3,480</span></li>
          <li><a href="/item/bbb222"><span class="title">ダミー商品B</span></a><span class="price">¥1,200</span></li>
          ${state.created ? `<li><a href="/item/${state.created}"><span class="title">ダミー商品A</span></a><span class="price">¥3,480</span></li>` : ''}
        </ul>`)
      );
    }

    if (url.pathname.startsWith('/item/')) {
      return html(
        res,
        page(`<main>
          <h1>ダミー商品A 完全版</h1>
          <div class="price">¥3,480</div>
          <img src="/item-image/1.jpg"><img src="/item-image/2.jpg">
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
