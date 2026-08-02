import http from 'node:http';
import fs from 'node:fs';
import * as store from './store.js';
import { executeRelist } from './relist.js';
import { STOP_FILE } from './config.js';
import { log } from './logger.js';

const STATUS_LABEL = {
  listed: '出品中',
  sold: '売却済み',
  pending_approval: '承認待ち',
  relisting: '再出品中',
  relisted: '再出品済み',
  error: 'エラー',
  archived: '完了',
};

function page(config, state) {
  const items = Object.values(state.items).sort((a, b) => {
    const rank = (item) => (item.status === 'pending_approval' ? 0 : item.status === 'error' ? 1 : 2);
    return rank(a) - rank(b);
  });

  const rows = items
    .map((item) => {
      const snapshot = item.snapshot || {};
      const actions =
        item.status === 'pending_approval' || item.status === 'error'
          ? `<form method="POST" action="/relist" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='処理中…'">
               <input type="hidden" name="itemId" value="${esc(item.itemId)}">
               <button class="go">この内容で再出品</button>
             </form>
             <form method="POST" action="/skip">
               <input type="hidden" name="itemId" value="${esc(item.itemId)}">
               <button class="skip">今回は出さない</button>
             </form>`
          : '';
      return `<tr class="s-${esc(item.status)}">
        <td><span class="badge">${esc(STATUS_LABEL[item.status] || item.status)}</span></td>
        <td>
          <div class="title">${esc(snapshot.title || '(タイトル未取得)')}</div>
          <div class="meta">${snapshot.price ? `¥${Number(snapshot.price).toLocaleString()}` : '価格未取得'}
            ・画像${(snapshot.images || []).length}枚
            ・<a href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.itemId)}</a></div>
          ${item.lastError ? `<div class="err">${esc(item.lastError)}</div>` : ''}
        </td>
        <td class="actions">${actions}</td>
      </tr>`;
    })
    .join('');

  const mode = config.autoApprove ? '完全自動' : '半自動（承認制）';
  const dry = config.dryRun ? '<span class="warn">dryRun 有効（実際には出品されません）</span>' : '';
  const stopped = fs.existsSync(STOP_FILE) ? '<span class="warn">停止中（data/STOP を削除すると再開）</span>' : '';

  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yahoo!フリマ 再出品ボット</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Hiragino Sans", sans-serif; margin: 0; padding: 24px; line-height: 1.6; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .mode { color: #666; margin-bottom: 16px; }
  .warn { color: #b45309; font-weight: 600; margin-left: 8px; }
  table { width: 100%; border-collapse: collapse; max-width: 900px; }
  td { border-top: 1px solid #ddd; padding: 12px 8px; vertical-align: top; }
  .title { font-weight: 600; }
  .meta { color: #666; font-size: 13px; }
  .err { color: #b91c1c; font-size: 13px; margin-top: 4px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eee; font-size: 12px; white-space: nowrap; }
  .s-pending_approval .badge { background: #fde68a; }
  .s-error .badge { background: #fecaca; }
  .actions { white-space: nowrap; }
  button { display: block; margin-bottom: 6px; padding: 8px 14px; border-radius: 8px; border: 1px solid #ccc; cursor: pointer; font-size: 14px; }
  .go { background: #2563eb; color: #fff; border-color: #2563eb; }
  @media (prefers-color-scheme: dark) { td { border-color: #333; } .badge { background: #333; } .mode { color: #999; } }
</style>
<h1>Yahoo!フリマ 再出品ボット</h1>
<div class="mode">モード: ${mode}${dry}${stopped}　／　本日の再出品: ${store.relistsToday(state)} / ${config.maxRelistsPerDay} 件</div>
<table>${rows || '<tr><td>監視対象がありません。<code>npm run track -- --all</code> を実行してください。</td></tr>'}</table>
<script>setTimeout(() => location.reload(), 30000)</script>`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(data))));
  });
}

export function startServer(config, selectors) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(page(config, store.load()));
      }

      if (req.method === 'POST' && req.url === '/relist') {
        const { itemId } = await readBody(req);
        // 出品処理は数十秒かかるので待たずに画面を返す
        executeRelist(config, selectors, itemId).catch((error) =>
          log.error('UIからの再出品に失敗:', error.message)
        );
        res.writeHead(303, { Location: '/' });
        return res.end();
      }

      if (req.method === 'POST' && req.url === '/skip') {
        const { itemId } = await readBody(req);
        store.update((s) => {
          if (s.items[itemId]) s.items[itemId].status = 'archived';
        });
        res.writeHead(303, { Location: '/' });
        return res.end();
      }

      res.writeHead(404).end('not found');
    } catch (error) {
      log.error('UIエラー:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(error.message);
    }
  });

  // 外部に晒さないよう localhost だけで待ち受ける
  server.listen(config.uiPort, '127.0.0.1', () => {
    log.info(`承認画面: http://localhost:${config.uiPort}`);
  });
  return server;
}
