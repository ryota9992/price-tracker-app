import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, saveConfig, INSPECT_DIR } from './config.js';
import { recentLogs, log } from './logger.js';
import * as store from './store.js';
import * as jobs from './jobs.js';
import { executeRelist, stopRequested, withinActiveHours } from './relist.js';
import { STOP_FILE } from './config.js';
import { startWatching, stopWatching, isWatching, nextCheck } from './watcher.js';
import { itemIdFromUrl } from './furima.js';
import { renderPage } from './ui.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('リクエストが大きすぎます'));
    });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(data))));
  });
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function startServer(initialConfig, selectors) {
  // 設定は画面から変更できるので、常に最新を読み直せるようにしておく
  let config = initialConfig;
  const getConfig = () => config;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const post = req.method === 'POST';

    try {
      // ---- 画面 ----
      if (!post && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderPage());
      }

      // ---- 状態の取得（画面が定期的に読みに来る） ----
      if (!post && url.pathname === '/api/status') {
        const state = store.load();
        return json(res, 200, {
          config: {
            autoApprove: config.autoApprove,
            dryRun: config.dryRun,
            pollIntervalMinutes: config.pollIntervalMinutes,
            maxRelistsPerDay: config.maxRelistsPerDay,
          },
          ...jobs.jobStatus(),
          watching: isWatching(),
          nextCheckAt: nextCheck(),
          activeHours: config.activeHours,
          outsideActiveHours: !withinActiveHours(config),
          stopped: stopRequested(),
          relistsToday: store.relistsToday(state),
          selectorsReady: fs.existsSync(path.join(INSPECT_DIR, 'mylistings-0.hints.json')),
          items: Object.values(state.items).map((item) => ({
            itemId: item.itemId,
            url: item.url,
            status: item.status,
            stock: typeof item.stock === 'number' ? item.stock : null,
            title: item.snapshot?.title || '',
            price: item.snapshot?.price ?? null,
            images: item.snapshot?.images?.length || 0,
            lastError: item.lastError || null,
          })),
          logs: recentLogs.slice(-80),
        });
      }

      if (!post) return json(res, 404, { error: 'not found' });

      // ---- 操作 ----
      const body = await readBody(req);

      switch (url.pathname) {
        case '/api/login/open':
          await jobs.openLogin(config, selectors);
          return json(res, 200, { ok: true });

        case '/api/login/done':
          await jobs.finishLogin();
          return json(res, 200, { ok: true });

        case '/api/login/cancel':
          await jobs.cancelLogin();
          return json(res, 200, { ok: true });

        case '/api/inspect':
          // URLをそのまま貼られても商品IDだけでも受け付ける
          jobs.startInspect(config, selectors, itemIdFromUrl(body.itemId) || body.itemId || null);
          return json(res, 200, { ok: true });

        case '/api/track-all':
          jobs.startTrackAll(config, selectors);
          return json(res, 200, { ok: true });

        case '/api/track-one': {
          const itemId = itemIdFromUrl(body.url) || body.url?.trim();
          if (!itemId) return json(res, 400, { error: '商品URLまたは商品IDを入力してください。' });
          const stock = body.stock === '' || body.stock === 'none' ? null : Number(body.stock);
          if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
            return json(res, 400, { error: '在庫は0以上の整数か none にしてください。' });
          }
          jobs.startTrackOne(config, selectors, itemId, stock);
          return json(res, 200, { ok: true });
        }

        case '/api/watch/start':
          if (!jobs.jobStatus().loggedIn) {
            return json(res, 400, { error: '先にログインしてください。' });
          }
          startWatching(getConfig, selectors).catch((error) =>
            log.error('監視ループが落ちました:', error.message)
          );
          return json(res, 200, { ok: true });

        case '/api/watch/stop':
          stopWatching();
          return json(res, 200, { ok: true });

        case '/api/relist':
          // 数十秒かかるので待たずに返す。結果はログに出る。
          jobs.startJob('再出品', () => executeRelist(config, selectors, body.itemId));
          return json(res, 200, { ok: true });

        case '/api/skip':
          store.update((s) => {
            if (s.items[body.itemId]) s.items[body.itemId].status = 'archived';
          });
          return json(res, 200, { ok: true });

        case '/api/stock': {
          const value = body.stock === 'none' || body.stock === '' ? null : Number(body.stock);
          if (value !== null && (!Number.isInteger(value) || value < 0)) {
            return json(res, 400, { error: '在庫は0以上の整数か none にしてください。' });
          }
          store.update((s) => {
            const item = s.items[body.itemId];
            if (!item) return;
            item.stock = value;
            // 補充されたら在庫切れ状態から監視に戻す
            if (item.status === 'out_of_stock' && value !== 0) item.status = 'listed';
          });
          return json(res, 200, { ok: true });
        }

        case '/api/settings': {
          const partial = {};
          if ('autoApprove' in body) partial.autoApprove = body.autoApprove === 'true';
          if ('dryRun' in body) partial.dryRun = body.dryRun === 'true';
          if ('pollIntervalMinutes' in body) {
            const minutes = Number(body.pollIntervalMinutes);
            if (!Number.isInteger(minutes) || minutes < 10) {
              return json(res, 400, { error: 'チェック間隔は10分以上にしてください。' });
            }
            partial.pollIntervalMinutes = minutes;
          }
          config = saveConfig(partial);
          log.info('設定を変更しました:', JSON.stringify(partial));
          return json(res, 200, { ok: true });
        }

        case '/api/emergency-stop':
          if (body.on === 'true') {
            fs.writeFileSync(STOP_FILE, '');
            stopWatching();
            log.warn('緊急停止しました。');
          } else {
            fs.rmSync(STOP_FILE, { force: true });
            log.info('緊急停止を解除しました。');
          }
          return json(res, 200, { ok: true });

        default:
          return json(res, 404, { error: 'not found' });
      }
    } catch (error) {
      log.error('画面の操作でエラー:', error.message);
      return json(res, 500, { error: error.message });
    }
  });

  // 既定では外部に晒さないよう localhost だけで待ち受ける。
  // Docker内ではポート転送が届かないので UI_BIND=0.0.0.0 を指定する
  // （その場合もホスト側の公開は 127.0.0.1 に絞ること）。
  const host = process.env.UI_BIND || '127.0.0.1';
  server.listen(config.uiPort, host, () => {
    log.info(`操作画面: http://localhost:${config.uiPort}（bind: ${host}）`);
  });
  return server;
}
