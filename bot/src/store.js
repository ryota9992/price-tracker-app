import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ensureDirs } from './config.js';

const FILE = path.join(DATA_DIR, 'state.json');

const EMPTY = { items: {}, relistLog: [] };

/**
 * items[itemId] = {
 *   itemId, url, status, trackedAt,
 *   snapshot: { title, description, price, condition, category, shipping..., images: [絶対パス] },
 *   pendingSince, relistedTo, lastError
 * }
 * status: 'listed' | 'sold' | 'pending_approval' | 'relisting' | 'relisted' | 'error' | 'archived'
 */
export function load() {
  ensureDirs();
  if (!fs.existsSync(FILE)) return structuredClone(EMPTY);
  try {
    return { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    // 壊れたstateで上書きしてしまわないよう退避してから作り直す
    fs.renameSync(FILE, `${FILE}.broken-${Date.now()}`);
    return structuredClone(EMPTY);
  }
}

export function save(state) {
  ensureDirs();
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

export function update(mutator) {
  const state = load();
  const result = mutator(state);
  save(state);
  return result;
}

export function relistsToday(state) {
  const today = new Date().toISOString().slice(0, 10);
  return state.relistLog.filter((entry) => entry.at.slice(0, 10) === today).length;
}

export function recordRelist(state, entry) {
  state.relistLog.push({ at: new Date().toISOString(), ...entry });
  // ログは直近500件だけ残す
  if (state.relistLog.length > 500) state.relistLog = state.relistLog.slice(-500);
}
