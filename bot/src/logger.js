import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ensureDirs } from './config.js';

function write(level, args) {
  const line = `[${new Date().toISOString()}] ${level} ${args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}`;
  console.log(line);
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
