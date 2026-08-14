import Anthropic from '@anthropic-ai/sdk';
import { fetchPageInfo } from '../../lib/fetchPage';
import { shopHintText } from '../../lib/shops';

// Web検索を伴うので既定の10秒では足りない（Vercel Hobbyは最大60秒）
export const config = { maxDuration: 60 };

const MODEL = 'claude-opus-5';
const EFFORT = process.env.LOOKUP_EFFORT || 'low';
const MAX_CONTINUATIONS = 3;

const SYSTEM_PROMPT = `あなたは日本の中古市場に詳しいリユース査定アシスタントです。
与えられた商品について、日本国内の買取店が今提示している買取価格をWeb検索で調べ、比較できる形にまとめます。

守ること:
- 必ずweb_searchで実際の買取価格ページを確認し、確認できた価格だけを載せる。推測で数字を作らない。
- 価格は日本円の整数（カンマなし）。「〜円まで」のような上限表記は上限額を price に入れ、note に条件を書く。
- 同じ商品でも容量・カラー・状態（未使用/中古美品/画面割れ等）で価格が変わる。想定した状態を condition に明記する。
- 買取価格が見つからない店は結果に含めない。1店も見つからない場合は shops を空配列にして notes で理由を説明する。
- 出力はJSONのみ。前置き・説明文・コードブロック記号は一切書かない。`;

function buildUserPrompt({ pageInfo, url, productName, condition }) {
  const lines = [];

  lines.push('次の商品の買取価格を調べてください。');
  lines.push('');

  if (!pageInfo && url) {
    // サーバー側でページを読めなかった場合は、Claudeにweb_fetchで読ませる
    lines.push('【iPhoneで開いていたページ】');
    lines.push(`URL: ${url}`);
    lines.push('このページをweb_fetchで開いて、どの商品かを特定してから買取価格を調べること。');
    if (productName) lines.push(`ユーザーが補足した商品名: ${productName}`);
  } else if (pageInfo) {
    lines.push('【iPhoneで開いていたページの情報】');
    lines.push(`URL: ${pageInfo.url}`);
    if (pageInfo.siteName) lines.push(`サイト: ${pageInfo.siteName}`);
    if (pageInfo.title) lines.push(`ページタイトル: ${pageInfo.title}`);
    if (pageInfo.productName && pageInfo.productName !== pageInfo.title) {
      lines.push(`商品名: ${pageInfo.productName}`);
    }
    if (pageInfo.brand) lines.push(`ブランド: ${pageInfo.brand}`);
    if (pageInfo.sku) lines.push(`型番/SKU: ${pageInfo.sku}`);
    if (pageInfo.listPrice) {
      lines.push(`このページの販売価格: ${pageInfo.listPrice} ${pageInfo.currency || 'JPY'}`);
    }
    if (pageInfo.description) lines.push(`説明: ${pageInfo.description}`);
  } else {
    lines.push('【調べたい商品】');
    lines.push(productName);
  }

  lines.push('');
  lines.push(`【想定する状態】${condition || '中古・美品（付属品あり、動作正常）'}`);
  lines.push('');
  lines.push('【優先的に確認する買取店】');
  lines.push(shopHintText());
  lines.push('');
  lines.push('商品カテゴリに合わない店は無理に調べなくてよい。上記以外でも、その商品を専門に扱う買取店が見つかればそれを含めてよい。');
  lines.push('');
  lines.push('【出力形式】次のJSONだけを出力する:');
  lines.push(`{
  "product": {
    "name": "特定した商品名（容量・型番まで含めて具体的に）",
    "model": "型番（不明なら null）",
    "category": "カテゴリ（スマホ / ゲーム機 / ブランド品 など）",
    "listPrice": 参考の新品または販売価格（数値、不明なら null）,
    "confidence": "high | medium | low（商品を正しく特定できた自信）"
  },
  "condition": "査定の前提とした状態",
  "shops": [
    {
      "name": "買取店名",
      "price": 買取価格（数値）,
      "condition": "その価格が適用される状態",
      "url": "価格を確認したページのURL",
      "note": "条件や補足（増額キャンペーン、本人確認の要否など。無ければ null）",
      "asOf": "価格の時点（例: 2026-08 / 不明なら null）"
    }
  ],
  "marketPrice": フリマ・オークションでの実売相場（数値、不明なら null）,
  "notes": "注意点があれば1〜3文。無ければ null"
}`);

  return lines.join('\n');
}

function extractText(content) {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function parseResult(text) {
  let jsonText = text.trim().replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const match = jsonText.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('検索結果を読み取れませんでした');
  }
  return JSON.parse(match[0]);
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const digits = value.replace(/[^\d]/g, '');
    if (digits) return Number(digits);
  }
  return null;
}

function normalize(parsed) {
  const shops = Array.isArray(parsed.shops) ? parsed.shops : [];

  const cleaned = shops
    .map((shop) => ({
      name: typeof shop?.name === 'string' ? shop.name : null,
      price: toNumber(shop?.price),
      condition: shop?.condition || null,
      url: typeof shop?.url === 'string' ? shop.url : null,
      note: shop?.note || null,
      asOf: shop?.asOf || null,
    }))
    .filter((shop) => shop.name && shop.price && shop.price > 0)
    .sort((a, b) => b.price - a.price);

  return {
    product: {
      name: parsed.product?.name || null,
      model: parsed.product?.model || null,
      category: parsed.product?.category || null,
      listPrice: toNumber(parsed.product?.listPrice),
      confidence: parsed.product?.confidence || null,
    },
    condition: parsed.condition || null,
    shops: cleaned,
    marketPrice: toNumber(parsed.marketPrice),
    notes: parsed.notes || null,
    fetchedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'サーバーにAPIキーが設定されていません' });
  }

  const { url, productName, condition } = req.body || {};

  if (!url && !productName) {
    return res.status(400).json({ error: 'URLまたは商品名を指定してください' });
  }

  let pageInfo = null;
  let pageWarning = null;

  if (url) {
    try {
      pageInfo = await fetchPageInfo(url);
    } catch (error) {
      console.error('fetchPageInfo error:', error);
      // 到達できないアドレスは検索側にも渡さない
      if (/アクセスできません|URLの形式|http\/https/.test(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      // それ以外の理由は詳細をログに残し、利用者には要約だけ見せる
      pageWarning = 'ページを直接読み取れなかったため、検索で商品を特定しました';
    }
  }

  try {
    const client = new Anthropic();

    const messages = [
      {
        role: 'user',
        content: buildUserPrompt({ pageInfo, url, productName, condition }),
      },
    ];

    let response;

    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        output_config: { effort: EFFORT },
        tools: [
          {
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: 12,
            user_location: { type: 'approximate', country: 'JP', timezone: 'Asia/Tokyo' },
          },
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
        ],
        messages,
      });

      // サーバー側ツールの反復上限に達した場合は、同じ会話を送り直して再開する
      if (response.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: response.content });
    }

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'この商品については回答できませんでした' });
    }

    const result = normalize(parseResult(extractText(response.content)));

    return res.status(200).json({
      ...result,
      source: pageInfo ? { url: pageInfo.url, host: pageInfo.host, title: pageInfo.title } : null,
      warning: pageWarning,
    });
  } catch (error) {
    // 詳細はサーバーログにのみ残し、利用者には常に日本語の一般メッセージを返す
    console.error('lookup error:', error);

    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: '混み合っています。少し待ってからもう一度お試しください' });
    }
    if (error instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `検索サービスのエラー (${error.status})` });
    }
    return res.status(500).json({ error: '検索中にエラーが発生しました。もう一度お試しください' });
  }
}
