import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ensureDirs } from './config.js';

// 画面に出すための直近ログ。ファイルとは別に持っておく。
export const recentLogs = [];

function write(level, args) {
  const time = new Date().toLocaleTimeString('ja-JP');
  const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const line = `[${new Date().toISOString()}] ${level} ${message}`;
  console.log(line);

  recentLogs.push({ time, level: level.trim(), message });
  if (recentLogs.length > 300) recentLogs.shift();
  try {
    ensureDirs();
    fs.appendFileSync(path.join(DATA_DIR, 'bot.log'), line + '\n');
  } catch {
    // ログファイルに書けなくても本処理は続ける
  }
}

export const log = {
  info: (...args) => write('INFO ', args),
  warn: (...args) => write('WARN ', args),
  error: (...args) => write('ERROR', args),
};
