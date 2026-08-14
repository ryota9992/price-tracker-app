import dns from 'dns';
import net from 'net';

const MAX_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

// 内部ネットワークへのアクセス（SSRF）を防ぐためのIPチェック
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // IPv4射影アドレス（::ffff:10.0.0.1 など）
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }

  return true;
}

async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('URLの形式が正しくありません');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('http/https のURLのみ対応しています');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new Error('このアドレスにはアクセスできません');
    }
    return url;
  }

  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) {
    throw new Error('このアドレスにはアクセスできません');
  }

  const addresses = await dns.promises.lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('このアドレスにはアクセスできません');
  }

  return url;
}

async function readCapped(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder('utf-8');
  let received = 0;
  let text = '';

  while (received < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    text += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return text;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function metaContent(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return decodeEntities(match[1]).trim();
  }
  return null;
}

function extractJsonLdProduct(html) {
  const scripts = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];

  for (const script of scripts) {
    const body = script.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    let parsed;
    try {
      parsed = JSON.parse(body.trim());
    } catch {
      continue;
    }

    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);

      const type = node['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (!types.includes('Product')) continue;

      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      return {
        name: typeof node.name === 'string' ? node.name : null,
        brand: typeof node.brand === 'string' ? node.brand : node.brand?.name || null,
        sku: node.sku || node.mpn || null,
        price: offers?.price ? String(offers.price) : null,
        currency: offers?.priceCurrency || null,
      };
    }
  }

  return null;
}

/**
 * 商品ページのURLから、商品名・型番・販売価格などの手がかりを抽出する。
 * ページが取得できない場合でもURL自体は手がかりとして返す。
 */
export async function fetchPageInfo(rawUrl) {
  let current = await assertPublicUrl(rawUrl);
  let response;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      response = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // 商品ページの多くはモバイルUAで軽量なHTMLを返す
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept-Language': 'ja,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      let next;
      try {
        next = new URL(response.headers.get('location'), current);
      } catch {
        throw new Error('リダイレクト先のURLが不正です');
      }
      current = await assertPublicUrl(next.toString());
      continue;
    }
    break;
  }

  if (!response.ok) {
    throw new Error(`ページを取得できませんでした (HTTP ${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    throw new Error('HTMLページではありません');
  }

  const html = await readCapped(response);
  const jsonLd = extractJsonLdProduct(html);

  const title =
    metaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    ]) || null;

  const description = metaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const siteName = metaContent(html, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
  ]);

  return {
    url: current.toString(),
    host: current.hostname,
    siteName,
    title,
    description: description ? description.slice(0, 500) : null,
    productName: jsonLd?.name || title,
    brand: jsonLd?.brand || null,
    sku: jsonLd?.sku || null,
    listPrice: jsonLd?.price || null,
    currency: jsonLd?.currency || null,
  };
}
