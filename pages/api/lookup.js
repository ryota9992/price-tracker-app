import Anthropic from '@anthropic-ai/sdk';
import { fetchPageInfo } from '../../lib/fetchPage';
import { shopHintText } from '../../lib/shops';

// Web検索を伴うので既定の10秒では足りない（Vercel Hobbyは最大60秒）
export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '10mb' } } };

const MODEL = 'claude-opus-5';
const EFFORT = process.env.LOOKUP_EFFORT || 'low';
const MAX_CONTINUATIONS = 3;

const SYSTEM_PROMPT = `あなたは「せどり（転売）」の利益判定を手伝う査定アシスタントです。
ユーザーは通販サイトの商品ページを見ており、その商品を買取に出したときに利益が出るか知りたいと思っています。

やること:
1. 与えられた画像またはURLから、その通販ページの「商品名」「購入価格」「ポイント還元」を正確に読み取る
2. その商品を日本国内の買取店が今いくらで買い取っているかをWeb検索で調べる
3. 見つけた情報をJSONで返す（利益の計算はしなくてよい。数値を正確に返すことだけに集中する）

購入価格・ポイントを読み取るときのルール:
- purchasePrice はその商品の実際の販売価格（送料や手数料は含めない）。カンマや円マークを除いた整数。
- pointsAmount は付与されるポイントの「円換算額」。「10%還元で1,598pt」のように書かれていれば pt数をそのまま円として扱ってよい（多くのポイントは1pt=1円）。
- ポイント還元率(%)しか分からずポイントの実数が読めない場合は pointsAmount は null にし、pointsRate に「10%」のように記録する。
- ポイントの記載が無ければ pointsAmount も pointsRate も null。
- クーポンやセール情報などポイント以外の値引きは無視してよい。

買取価格を調べるときのルール:
- 必ずweb_searchで実際の買取価格ページを確認し、確認できた価格だけを載せる。推測で数字を作らない。
- 同じ商品でも状態（未使用/中古美品/画面割れ等）で価格が変わる。想定した状態を condition に明記する。
- 買取価格が見つからない店は結果に含めない。1店も見つからない場合は shops を空配列にする。
- 出力はJSONのみ。前置き・説明文・コードブロック記号は一切書かない。`;

function buildUserPrompt({ pageInfo, hasImage, url, productName, condition, manualPrice, manualPoints }) {
  const lines = [];

  lines.push('次の商品ページについて、購入価格・ポイント・買取価格を調べてください。');
  lines.push('');

  if (hasImage) {
    lines.push('【添付画像】');
    lines.push('通販サイトの商品ページのスクリーンショットです。この画像から商品名・価格・ポイント表示を読み取ってください。');
    if (url) lines.push(`参考URL: ${url}`);
    if (productName) lines.push(`商品名の補足: ${productName}`);
  } else if (pageInfo || url) {
    lines.push('【通販ページ】');
    lines.push(`URL: ${(pageInfo && pageInfo.url) || url}`);
    if (pageInfo?.siteName) lines.push(`サイト: ${pageInfo.siteName}`);
    if (pageInfo?.title) lines.push(`ページタイトル: ${pageInfo.title}`);
    if (pageInfo?.productName && pageInfo.productName !== pageInfo.title) {
      lines.push(`商品名候補: ${pageInfo.productName}`);
    }
    if (pageInfo?.listPrice) {
      lines.push(`ページから読み取れた価格: ${pageInfo.listPrice} ${pageInfo.currency || 'JPY'}`);
    }
    lines.push('このページをweb_fetchで開いて、正確な商品名・価格・ポイント還元を確認してください（サーバー側の下読みは不正確な場合があります）。');
    if (productName) lines.push(`商品名の補足: ${productName}`);
  } else {
    lines.push('【調べたい商品】');
    lines.push(productName);
    lines.push('購入価格・ポイントの情報はありません。分かる範囲でよいので一般的な実売価格を調べてください。');
  }

  if (manualPrice != null) {
    lines.push('');
    lines.push(`【ユーザーが確認した購入価格】${manualPrice}円（このまま purchasePrice として採用すること）`);
  }
  if (manualPoints != null) {
    lines.push(`【ユーザーが確認したポイント還元額】${manualPoints}円（このまま pointsAmount として採用すること）`);
  }

  lines.push('');
  lines.push(`【想定する買取時の状態】${condition || '中古・美品（付属品あり、動作正常）'}`);
  lines.push('');
  lines.push('【優先的に確認する買取店】');
  lines.push(shopHintText());
  lines.push('');
  lines.push('商品カテゴリに合わない店は無理に調べなくてよい。上記以外でも、その商品を専門に扱う買取店が見つかればそれを含めてよい。');
  lines.push('');
  lines.push('【出力形式】次のJSONだけを出力する:');
  lines.push(`{
  "product": {
    "name": "特定した商品名（容量・型番・エディションまで具体的に）",
    "model": "型番（不明なら null）",
    "category": "カテゴリ（ゲーム / スマホ / 家電 など）",
    "confidence": "high | medium | low（商品を正しく特定できた自信）"
  },
  "purchase": {
    "price": 購入価格（数値、円。読み取れなければ null）,
    "pointsAmount": ポイントの円換算額（数値。不明なら null）,
    "pointsRate": "ポイント還元率の表記（例: 10%。不明なら null）"
  },
  "shops": [
    {
      "name": "買取店名",
      "price": 買取価格（数値）,
      "condition": "その価格が適用される状態",
      "url": "価格を確認したページのURL",
      "note": "条件や補足（無ければ null）",
      "asOf": "価格の時点（例: 2026-08。不明なら null）"
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

function normalize(parsed, overrides) {
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

  const purchasePrice = overrides.manualPrice != null ? overrides.manualPrice : toNumber(parsed.purchase?.price);
  const pointsAmount = overrides.manualPoints != null ? overrides.manualPoints : toNumber(parsed.purchase?.pointsAmount);

  return {
    product: {
      name: parsed.product?.name || null,
      model: parsed.product?.model || null,
      category: parsed.product?.category || null,
      confidence: parsed.product?.confidence || null,
    },
    purchase: {
      price: purchasePrice,
      pointsAmount,
      pointsRate: parsed.purchase?.pointsRate || null,
    },
    condition: overrides.condition || null,
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

  const { url, imageData, productName, condition, manualPrice, manualPoints } = req.body || {};

  if (!url && !imageData && !productName) {
    return res.status(400).json({ error: 'URL・画像・商品名のいずれかを指定してください' });
  }

  let pageInfo = null;
  let pageWarning = null;

  // 画像がある場合はサーバー側のページ取得は行わず、モデルに直接読ませる
  if (url && !imageData) {
    try {
      pageInfo = await fetchPageInfo(url);
    } catch (error) {
      console.error('fetchPageInfo error:', error);
      if (/アクセスできません|URLの形式|http\/https/.test(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      pageWarning = 'ページを直接読み取れなかったため、検索で商品を特定しました';
    }
  }

  const manualPriceNum = manualPrice != null ? toNumber(manualPrice) : null;
  const manualPointsNum = manualPoints != null ? toNumber(manualPoints) : null;

  try {
    const client = new Anthropic();

    const promptText = buildUserPrompt({
      pageInfo,
      hasImage: Boolean(imageData),
      url,
      productName,
      condition,
      manualPrice: manualPriceNum,
      manualPoints: manualPointsNum,
    });

    const userContent = imageData
      ? [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
          { type: 'text', text: promptText },
        ]
      : promptText;

    const messages = [{ role: 'user', content: userContent }];

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

    const result = normalize(parseResult(extractText(response.content)), {
      manualPrice: manualPriceNum,
      manualPoints: manualPointsNum,
      condition,
    });

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
