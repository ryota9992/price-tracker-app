import { checkOnce, stopRequested } from './relist.js';
import { startServer } from './server.js';
import { log } from './logger.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function watch(config, selectors) {
  startServer(config, selectors);
  log.info(
    `監視を開始します。モード: ${config.autoApprove ? '完全自動' : '半自動（承認制）'} / dryRun: ${config.dryRun}`
  );

  let consecutiveErrors = 0;

  for (;;) {
    if (stopRequested()) {
      log.warn('STOPファイルを検知しました。監視ループを終了します。');
      return;
    }

    try {
      await checkOnce(config, selectors);
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      log.error('チェックに失敗:', error.message);
      if (consecutiveErrors >= 5) {
        log.error('連続で5回失敗したため監視を停止します。設定とログを確認してください。');
        return;
      }
    }

    // 等間隔アクセスを避けるためランダムなブレを足す
    const jitter = Math.random() * (config.jitterMinutes || 0);
    const waitMinutes = config.pollIntervalMinutes + jitter;
    log.info(`次のチェックまで約 ${waitMinutes.toFixed(1)} 分待ちます。`);
    await sleep(waitMinutes * 60 * 1000);
  }
}
