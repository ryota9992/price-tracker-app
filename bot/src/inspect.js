import fs from 'node:fs';
import path from 'node:path';
import { INSPECT_DIR, ensureDirs } from './config.js';
import { log } from './logger.js';

/**
 * ログイン済みブラウザで各画面のHTML・スクリーンショット・候補セレクタを吐き出す。
 * selectors.json を実際のDOMに合わせて埋めるための道具。
 */
export async function inspectPage(page, name, url) {
  ensureDirs();
  log.info(`inspect: ${name} → ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4000);

  const base = path.join(INSPECT_DIR, name);
  fs.writeFileSync(`${base}.html`, await page.content());
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});

  const hints = await page.evaluate(() => {
    const describe = (el) => {
      const classes = (el.className && typeof el.className === 'string' ? el.className : '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join('.');
      return [
        el.tagName.toLowerCase(),
        el.id ? `#${el.id}` : '',
        classes ? `.${classes}` : '',
        el.getAttribute('name') ? `[name="${el.getAttribute('name')}"]` : '',
        el.getAttribute('placeholder') ? `[placeholder="${el.getAttribute('placeholder')}"]` : '',
      ].join('');
    };

    const collect = (selector, limit = 30) =>
      Array.from(document.querySelectorAll(selector))
        .slice(0, limit)
        .map((el) => ({
          selector: describe(el),
          text: (el.innerText || el.value || '').trim().slice(0, 60),
        }));

    return {
      url: location.href,
      title: document.title,
      itemLinks: Array.from(document.querySelectorAll("a[href*='/item/']"))
        .slice(0, 20)
        .map((a) => a.getAttribute('href')),
      inputs: collect('input, textarea, select'),
      buttons: collect('button, [role="button"]'),
      headings: collect('h1, h2, h3', 15),
      soldLike: Array.from(document.querySelectorAll('*'))
        .filter((el) => {
          const text = (el.childNodes.length === 1 ? el.textContent : '') || '';
          return /売却済み|SOLD|売り切れ|取引中/.test(text.trim());
        })
        .slice(0, 10)
        .map(describe),
    };
  });

  fs.writeFileSync(`${base}.hints.json`, JSON.stringify(hints, null, 2));
  log.info(`保存しました: ${base}.html / ${base}.png / ${base}.hints.json`);
  return hints;
}
