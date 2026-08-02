import fs from 'node:fs';
import { STOP_FILE } from './config.js';
import { launch, pace } from './browser.js';
import * as furima from './furima.js';
import * as store from './store.js';
import { notify } from './notify.js';
import { log } from './logger.js';

export function stopRequested() {
  return fs.existsSync(STOP_FILE);
}

export function withinActiveHours(config) {
  const { from, to } = config.activeHours || { from: 0, to: 24 };
  const hour = new Date().getHours();
  return hour >= from && hour < to;
}

/** 監視対象に追加する（スナップショットもここで取っておく）。 */
export async function trackItems(config, selectors, { itemIds, all }) {
  const { browser, context } = await launch(config);
  try {
    const page = await context.newPage();
    let targets = itemIds || [];

    if (all) {
      await furima.openMyListings(page, selectors);
      const listings = await furima.scrapeMyListings(page, selectors);
      targets = listings.filter((item) => !item.sold).map((item) => item.itemId);
      log.info(`出品中の商品を ${targets.length} 件見つけました。`);
    }
    await page.close();

    const added = [];
    for (const itemId of targets) {
      const state = store.load();
      if (state.items[itemId] && state.items[itemId].status !== 'archived') {
        log.info(`${itemId} は既に監視中です。スキップします。`);
        continue;
      }
      const snapshot = await furima.snapshotItem(context, selectors, itemId);
      store.update((s) => {
        s.items[itemId] = {
          itemId,
          url: furima.itemUrl(selectors, itemId),
          status: 'listed',
          trackedAt: new Date().toISOString(),
          snapshot,
        };
      });
      added.push({ itemId, title: snapshot.title, images: snapshot.images.length });
      log.info(`監視に追加: ${itemId} 「${snapshot.title}」 画像${snapshot.images.length}枚`);
      await pace(config);
    }
    return added;
  } finally {
    await browser.close();
  }
}

/** 1回分の売却チェック。売れていたら再出品ジョブを作る。 */
export async function checkOnce(config, selectors) {
  if (stopRequested()) {
    log.warn('STOPファイルがあるため処理を中止します（data/STOP を削除すると再開します）。');
    return { skipped: 'stop' };
  }
  if (!withinActiveHours(config)) {
    log.info('稼働時間外のためスキップします。');
    return { skipped: 'hours' };
  }

  const state = store.load();
  const tracked = Object.values(state.items).filter((item) =>
    ['listed', 'error'].includes(item.status)
  );
  if (tracked.length === 0) {
    log.info('監視対象がありません。`npm run track -- --all` で登録してください。');
    return { skipped: 'empty' };
  }

  const { browser, context } = await launch(config);
  const detected = [];
  try {
    const page = await context.newPage();
    await page.goto(selectors.baseUrl, { waitUntil: 'domcontentloaded' });
    if (!(await furima.isLoggedIn(page, selectors))) {
      await notify(config, 'Yahoo!フリマ 再出品ボット', 'ログインが切れています。`npm run login` を実行してください。');
      throw new Error('ログインが切れています。`npm run login` を実行してください。');
    }

    await furima.openMyListings(page, selectors);
    const listings = await furima.scrapeMyListings(page, selectors);
    await page.close();
    log.info(`一覧から ${listings.length} 件を取得しました。`);

    const byId = new Map(listings.map((item) => [item.itemId, item]));

    for (const item of tracked) {
      const found = byId.get(item.itemId);
      // 一覧から消えている＝売却または削除。判定できないものは触らない。
      if (!found) {
        log.info(`${item.itemId} が一覧に見つかりません。手動確認が必要です。`);
        continue;
      }
      if (!found.sold) continue;

      log.info(`売却を検知: ${item.itemId}「${item.snapshot?.title || found.title}」`);
      detected.push(item.itemId);

      store.update((s) => {
        s.items[item.itemId].status = config.autoApprove ? 'relisting' : 'pending_approval';
        s.items[item.itemId].soldDetectedAt = new Date().toISOString();
        if (!config.autoApprove) s.items[item.itemId].pendingSince = new Date().toISOString();
      });

      if (config.autoApprove) {
        await pace(config);
        await executeRelist(config, selectors, item.itemId, { context });
      } else {
        await notify(
          config,
          '売れました！再出品の承認待ち',
          `「${item.snapshot?.title || found.title}」\nhttp://localhost:${config.uiPort} で承認してください。`
        );
      }
    }
  } finally {
    await browser.close();
  }
  return { detected };
}

/**
 * 実際に再出品する。半自動でも完全自動でも通る唯一の経路。
 * context を渡すと既存ブラウザを使い回す。
 */
export async function executeRelist(config, selectors, itemId, { context: given } = {}) {
  const state = store.load();
  const item = state.items[itemId];
  if (!item) throw new Error(`${itemId} は監視対象にありません。`);
  if (!item.snapshot) throw new Error(`${itemId} のスナップショットがありません。`);

  if (stopRequested()) throw new Error('STOPファイルがあるため再出品を中止しました。');

  const todayCount = store.relistsToday(state);
  if (todayCount >= config.maxRelistsPerDay) {
    const message = `1日の再出品上限（${config.maxRelistsPerDay}件）に達しました。`;
    log.warn(message);
    await notify(config, 'Yahoo!フリマ 再出品ボット', message);
    throw new Error(message);
  }

  let browser = null;
  let context = given;
  if (!context) ({ browser, context } = await launch(config));

  try {
    store.update((s) => {
      s.items[itemId].status = 'relisting';
    });

    const result = await furima.createListing(context, selectors, item.snapshot, {
      dryRun: config.dryRun,
    });

    if (result.dryRun) {
      store.update((s) => {
        s.items[itemId].status = 'pending_approval';
        s.items[itemId].lastError = null;
        s.items[itemId].dryRunScreenshot = result.screenshot;
      });
      await notify(
        config,
        'dryRun で再出品を確認しました',
        `「${item.snapshot.title}」の入力画面: ${result.screenshot}\n実際に出品するには config.json の dryRun を false にしてください。`
      );
      return result;
    }

    store.update((s) => {
      s.items[itemId].status = 'relisted';
      s.items[itemId].relistedTo = result.newItemId;
      s.items[itemId].relistedAt = new Date().toISOString();
      s.items[itemId].lastError = null;

      // 新しい出品をそのまま次の監視対象にする（これで売れるたびに回り続ける）
      if (result.newItemId) {
        s.items[result.newItemId] = {
          itemId: result.newItemId,
          url: result.url,
          status: 'listed',
          trackedAt: new Date().toISOString(),
          // 画像は元商品のフォルダのものを使い回す
          snapshot: { ...item.snapshot, itemId: result.newItemId },
          relistedFrom: itemId,
        };
        s.items[itemId].status = 'archived';
      }
      store.recordRelist(s, { from: itemId, to: result.newItemId, title: item.snapshot.title });
    });

    log.info(`再出品しました: ${itemId} → ${result.newItemId} 「${item.snapshot.title}」`);
    await notify(config, '再出品しました', `「${item.snapshot.title}」\n${result.url}`);
    return result;
  } catch (error) {
    store.update((s) => {
      s.items[itemId].status = 'error';
      s.items[itemId].lastError = error.message;
    });
    log.error(`再出品に失敗: ${itemId}`, error.message);
    await notify(config, '再出品に失敗しました', `「${item.snapshot?.title}」\n${error.message}`);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
