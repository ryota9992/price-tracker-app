import { checkOnce, stopRequested } from './relist.js';
import { log } from './logger.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;
let nextCheckAt = null;

export function isWatching() {
  return running;
}

export function nextCheck() {
  return nextCheckAt;
}

export function stopWatching() {
  if (!running) return;
  running = false;
  nextCheckAt = null;
  log.info('監視を停止しました。');
}

/**
 * 監視ループ。getConfig を毎回呼ぶので、画面から設定を変えると次の回から反映される。
 */
export async function startWatching(getConfig, selectors) {
  if (running) return;
  running = true;

  const first = getConfig();
  log.info(
    `監視を開始しました。モード: ${first.autoApprove ? '完全自動' : '半自動（承認制）'} / お試しモード: ${
      first.dryRun ? 'オン' : 'オフ'
    }`
  );

  let consecutiveErrors = 0;

  while (running) {
    const config = getConfig();

    if (stopRequested()) {
      log.warn('STOPファイルを検知しました。監視を停止します。');
      running = false;
      nextCheckAt = null;
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
        running = false;
        nextCheckAt = null;
        return;
      }
    }

    if (!running) break;

    // 等間隔アクセスを避けるためランダムなブレを足す
    const jitter = Math.random() * (config.jitterMinutes || 0);
    const waitMs = (config.pollIntervalMinutes + jitter) * 60 * 1000;
    nextCheckAt = Date.now() + waitMs;
    log.info(`次のチェックまで約 ${((config.pollIntervalMinutes + jitter)).toFixed(1)} 分待ちます。`);

    // 停止ボタンにすぐ反応できるよう、細かく刻んで待つ
    const until = Date.now() + waitMs;
    while (running && Date.now() < until) {
      await sleep(Math.min(1000, until - Date.now()));
    }
  }
  nextCheckAt = null;
}
