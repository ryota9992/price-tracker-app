import { loadConfig, loadSelectors, ensureDirs, AUTH_FILE } from './config.js';
import { launch, saveAuth, hasAuth } from './browser.js';
import { inspectPage } from './inspect.js';
import { trackItems, checkOnce, executeRelist } from './relist.js';
import { watch } from './watcher.js';
import { startServer } from './server.js';
import * as store from './store.js';
import * as furima from './furima.js';
import { log } from './logger.js';

const [, , command, ...args] = process.argv;

function requireAuth() {
  if (!hasAuth()) {
    throw new Error('未ログインです。先に `npm run login` を実行してください。');
  }
}

async function main() {
  ensureDirs();
  const selectors = loadSelectors();

  switch (command) {
    case 'login': {
      const config = loadConfig();
      // ログインは必ず画面を出して手動で行う（ID/パスワードはボットに渡さない）
      const { browser, context } = await launch(config, { headless: false, useAuth: false });
      const page = await context.newPage();
      await page.goto(selectors.baseUrl);
      console.log('\n──────────────────────────────────────────');
      console.log('開いたブラウザで Yahoo! JAPAN ID にログインしてください。');
      console.log('（2段階認証もこの画面で済ませてください）');
      console.log('ログインが終わったら、このターミナルで Enter を押してください。');
      console.log('──────────────────────────────────────────\n');
      await new Promise((resolve) => process.stdin.once('data', resolve));
      await saveAuth(context);
      await browser.close();
      console.log(`保存先: ${AUTH_FILE}（このファイルは絶対に共有しないでください）`);
      break;
    }

    case 'inspect': {
      requireAuth();
      const config = loadConfig();
      const { browser, context } = await launch(config, { headless: false });
      const page = await context.newPage();
      const listingUrls = Array.isArray(selectors.urls.myListings)
        ? selectors.urls.myListings
        : [selectors.urls.myListings];

      await inspectPage(page, 'top', selectors.baseUrl);
      for (const [index, url] of listingUrls.entries()) {
        await inspectPage(page, `mylistings-${index}`, selectors.baseUrl + url);
      }
      await inspectPage(page, 'sell', selectors.baseUrl + selectors.urls.sell);
      if (args[0]) await inspectPage(page, 'item', furima.itemUrl(selectors, args[0]));

      console.log('\ndata/inspect/ の *.hints.json と *.png を見ながら selectors.json を修正してください。');
      await browser.close();
      break;
    }

    case 'track': {
      requireAuth();
      const config = loadConfig();
      const all = args.includes('--all');
      const itemIds = args.filter((a) => !a.startsWith('--')).map((a) => furima.itemIdFromUrl(a) || a);
      if (!all && itemIds.length === 0) {
        throw new Error('使い方: npm run track -- --all  もしくは  npm run track -- <商品URL or 商品ID>');
      }
      const added = await trackItems(config, selectors, { itemIds, all });
      console.log(`${added.length} 件を監視対象に追加しました。`);
      break;
    }

    case 'list': {
      const state = store.load();
      const items = Object.values(state.items);
      if (items.length === 0) return console.log('監視対象はありません。');
      for (const item of items) {
        console.log(
          `${item.status.padEnd(16)} ${item.itemId}  ${item.snapshot?.title || ''}${
            item.lastError ? `  (エラー: ${item.lastError})` : ''
          }`
        );
      }
      console.log(`\n本日の再出品: ${store.relistsToday(state)} 件`);
      break;
    }

    case 'once': {
      requireAuth();
      const config = loadConfig();
      const result = await checkOnce(config, selectors);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'relist': {
      requireAuth();
      const config = loadConfig();
      const itemId = furima.itemIdFromUrl(args[0]) || args[0];
      if (!itemId) throw new Error('使い方: npm run relist -- <商品ID>');
      await executeRelist(config, selectors, itemId);
      break;
    }

    case 'ui': {
      const config = loadConfig();
      startServer(config, selectors);
      break;
    }

    case 'watch': {
      requireAuth();
      const config = loadConfig();
      await watch(config, selectors);
      break;
    }

    default:
      console.log(`使い方:
  npm run login              ブラウザでログインしてセッションを保存
  npm run inspect            画面のHTML/セレクタ候補を data/inspect/ に出力
  npm run track -- --all     出品中の商品をまとめて監視対象に登録
  npm run track -- <URL>     商品を1つ監視対象に登録
  npm run list               監視状況を表示
  npm run once               売却チェックを1回だけ実行
  npm run relist -- <ID>     指定商品を手動で再出品
  npm run ui                 承認画面だけ起動
  npm run watch              常駐（監視 + 承認画面）`);
  }
}

main().catch((error) => {
  log.error(error.message);
  process.exitCode = 1;
});
