import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const IMAGE_DIR = path.join(DATA_DIR, 'images');
export const INSPECT_DIR = path.join(DATA_DIR, 'inspect');
export const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
export const STOP_FILE = path.join(DATA_DIR, 'STOP');

const DEFAULTS = {
  autoApprove: false,
  dryRun: true,
  headless: false,
  pollIntervalMinutes: 15,
  jitterMinutes: 5,
  maxRelistsPerDay: 20,
  minSecondsBetweenActions: 8,
  uiPort: 8787,
  notify: { desktop: true, webhookUrl: '' },
  activeHours: { from: 8, to: 24 },
  browserChannel: '',
};

function stripComments(obj) {
  if (Array.isArray(obj)) return obj;
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_')) continue;
    out[key] = stripComments(value);
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadConfig() {
  const file = path.join(ROOT, 'config.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      'config.json がありません。`cp config.example.json config.json` を実行して設定してください。'
    );
  }
  const config = { ...DEFAULTS, ...stripComments(readJson(file)) };

  // ポーリング間隔の下限を強制する。短すぎるアクセスはアカウントを危険にさらす。
  if (config.pollIntervalMinutes < 10) {
    config.pollIntervalMinutes = 10;
  }
  return config;
}

/** 画面から設定を変更する。_コメント行は残したまま値だけ差し替える。 */
export function saveConfig(partial) {
  const file = path.join(ROOT, 'config.json');
  const raw = readJson(file);
  for (const [key, value] of Object.entries(partial)) {
    raw[key] = value;
  }
  fs.writeFileSync(file, JSON.stringify(raw, null, 2));
  return loadConfig();
}

/** config.json がなければ example から作る（初回起動用）。 */
export function ensureConfig() {
  const file = path.join(ROOT, 'config.json');
  if (!fs.existsSync(file)) {
    fs.copyFileSync(path.join(ROOT, 'config.example.json'), file);
  }
  return file;
}

export function loadSelectors() {
  return stripComments(readJson(path.join(ROOT, 'selectors.json')));
}

export function ensureDirs() {
  for (const dir of [DATA_DIR, IMAGE_DIR, INSPECT_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
