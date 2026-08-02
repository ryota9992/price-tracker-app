import { execFile } from 'node:child_process';
import { log } from './logger.js';

export async function notify(config, title, message) {
  log.info(`通知: ${title} — ${message}`);

  if (config.notify?.webhookUrl) {
    try {
      await fetch(config.notify.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Slack は text、Discord は content を見るので両方入れておく
        body: JSON.stringify({ text: `${title}\n${message}`, content: `${title}\n${message}` }),
      });
    } catch (error) {
      log.warn('Webhook通知に失敗:', error.message);
    }
  }

  if (config.notify?.desktop && process.platform === 'darwin') {
    const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
    execFile('osascript', ['-e', script], () => {});
  }
}
