import Anthropic from '@anthropic-ai/sdk';
import { fetchPageInfo } from '../../lib/fetchPage';
import { shopHintText } from '../../lib/shops';
import { searchScannerPrices, ScannerError } from '../../lib/scanner';

// ヘッドレスブラウザでのログイン・検索を伴うため長めに確保（Vercel Hobbyは最大60秒）
export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '10mb' } } };

const MODEL = 'claude-opus-5';
const EFFORT = process.env.LOOKUP_EFFORT || 'low';
const MAX_CONTINUATIONS = 3;

const EXTRACT_SYSTEM_PROMPT = `あなたは通販ページの読み取りを行うアシスタントです。
与えられた画像またはURLから、商品名・購入価格・ポイント還元を正確に読み取り、JSONで返してください。

ルール:
- purchasePrice はその商品の実際の販売価格（送料や手数料は含めない）。カンマや円マークを除いた整数。
- pointsAmount は付与されるポイントの「円換算額」。「10%還元で1,598pt」のように書かれていれば pt数をそのまま円として扱ってよい（多くのポイントは1pt=1円）。
- ポイント還元率(%)しか分からずポイントの実数が読めない場合は pointsAmount は null にし、pointsRate に「10%」のように記録する。
- ポイントの記載が無ければ pointsAmount も pointsRate も null。
- 出力はJSONのみ。前置き・説明文・コードブロック記号は一切書かない。`;

const SEARCH_SYSTEM_PROMPT = `あなたは日本の中古市場に詳しいリユース査定アシスタントです。
与えられた商品について、日本国内の買取店が今提示している買取価格をWeb検索で調べ、JSONで返してください。

守ること:
- 必ずweb_searchで実際の買取価格ページを確認し、確認できた価格だけを載せる。推測で数字を作らない。
- 買取価格が見つからない店は結果に含めない。1店も見つからない場合は shops を空配列にする。
- 出力はJSONのみ。前置き・説明文・コードブロック記号は一切書かない。`;

function buildExtractPrompt({ pageInfo, hasImage, url, productName }) {
  const lines = [];
  lines.push('次の通販ページから、商品名・購入価格・ポイント還元を読み取ってください。');
  lines.push('');

  if (hasImage) {
    lines.push('【添付画像】通販サイトの商品ページのスクリーンショットです。');
    if (url) lines.push(`参考URL: ${url}`);
    if (productName) lines.push(`商品名の補足: ${productName}`);
  } else if (pageInfo || url) {
    lines.push(`URL: ${(pageInfo && pageInfo.url) || url}`);
    if (pageInfo?.title) lines.push(`ページタイトル: ${pageInfo.title}`);
    if (pageInfo?.listPrice) lines.push(`ページから読み取れた価格: ${pageInfo.listPrice} ${pageInfo.currency || 'JPY'}`);
    lines.push('このページをweb_fetchで開いて、正確な商品名・価格・ポイント還元を確認してください。');
    if (productName) lines.push(`商品名の補足: ${productName}`);
  } else {
    lines.push(`商品名: ${productName}`);
    lines.push('購入価格・ポイントの情報はありません。分かる範囲でよいので一般的な実売価格を調べてください。');
  }

  lines.push('');
  lines.push('【出力形式】次のJSONだけを出力する:');
  lines.push(`{
  "product": {
    "name": "特定した商品名（容量・型番・エディションまで具体的に。JANやASINが分かれば含める）",
    "model": "型番（不明なら null）",
    "category": "カテゴリ（ゲーム / スマホ / 家電 など）",
    "confidence": "high | medium | low"
  },
  "purchase": {
    "price": 購入価格（数値、円。読み取れなければ null）,
    "pointsAmount": ポイントの円換算額（数値。不明なら null）,
    "pointsRate": "ポイント還元率の表記（例: 10%。不明なら null）"
  }
}`);

  return lines.join('\n');
}

function buildSearchPrompt({ query, condition }) {
  const lines = [];
  lines.push(`次の商品の買取価格を、日本国内の買取店について調べてください。`);
  lines.push(`商品: ${query}`);
  lines.push('');
  lines.push(`【想定する買取時の状態】${condition || '中古・美品（付属品あり、動作正常）'}`);
  lines.push('');
  lines.push('【優先的に確認する買取店】');
  lines.push(shopHintText());
  lines.push('');
  lines.push('【出力形式】次のJSONだけを出力する:');
  lines.push(`{
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

function parseJson(text) {
  const jsonText = text.trim().replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const match = jsonText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('応答を読み取れませんでした');
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

async function callClaude(client, { system, userContent }) {
  const messages = [{ role: 'user', content: userContent }];
  let response;

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
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

    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('REFUSAL');
  }

  return response;
}

function cleanShops(rawShops) {
  return (Array.isArray(rawShops) ? rawShops : [])
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
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'サーバーにAPIキーが設定されていません' });
  }

  const { url, imageData, productName, condition, manualPrice, manualPoints, debug } = req.body || {};

  if (!url && !imageData && !productName) {
    return res.status(400).json({ error: 'URL・画像・商品名のいずれかを指定してください' });
  }

  let pageInfo = null;
  let pageWarning = null;

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
  const debugMode = Boolean(debug);

  try {
    const client = new Anthropic();

    // --- 商品名・購入価格・ポイントの抽出（画像 or ページ or 商品名のみ） ---
    const extractPromptText = buildExtractPrompt({ pageInfo, hasImage: Boolean(imageData), url, productName });
    const extractContent = imageData
      ? [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
          { type: 'text', text: extractPromptText },
        ]
      : extractPromptText;

    // 早期に検索クエリの候補があれば、抽出と並行して買取スキャナーの検索を始める
    const earlyQuery = pageInfo?.productName || pageInfo?.title || (!imageData ? productName : null) || null;
    const earlyScannerPromise = earlyQuery
      ? searchScannerPrices(earlyQuery, { debug: debugMode }).catch((e) => ({ __error: e }))
      : null;

    let extraction = { product: {}, purchase: {} };
    try {
      if (imageData || url) {
        const extractResponse = await callClaude(client, { system: EXTRACT_SYSTEM_PROMPT, userContent: extractContent });
        extraction = parseJson(extractText(extractResponse.content));
      } else {
        extraction = { product: { name: productName, confidence: 'low' }, purchase: {} };
      }
    } catch (extractError) {
      // ここで抜けると earlyScannerPromise 内のブラウザが閉じられないまま
      // 関数が終了してしまうので、失敗時も必ず後始末を待ってから投げ直す
      if (earlyScannerPromise) await earlyScannerPromise.catch(() => {});
      throw extractError;
    }

    const finalQuery = extraction?.product?.name || earlyQuery || productName || null;

    // --- 買取スキャナーで価格取得（早期検索の結果を使う。無ければ／空なら改めて検索） ---
    let scannerResult = null;
    let scannerError = null;

    if (earlyScannerPromise) {
      const early = await earlyScannerPromise;
      if (early && early.__error) {
        scannerError = early.__error;
      } else if (early && early.shops.length > 0) {
        scannerResult = early;
      } else if (finalQuery && finalQuery !== earlyQuery) {
        // 早期検索が空振り、かつモデルがより正確な商品名を出せた場合は取り直す
        try {
          scannerResult = await searchScannerPrices(finalQuery, { debug: debugMode });
        } catch (e) {
          scannerError = e;
        }
      } else {
        scannerResult = early;
      }
    } else if (finalQuery) {
      try {
        scannerResult = await searchScannerPrices(finalQuery, { debug: debugMode });
      } catch (e) {
        scannerError = e;
      }
    }

    if (scannerError) {
      console.error('scanner error:', scannerError.step, scannerError.message);
    }

    let shops = scannerResult?.shops || [];
    let priceSource = shops.length > 0 ? 'scanner' : 'none';
    let marketPrice = null;
    let notes = null;

    // --- 買取スキャナーで見つからなければWeb検索にフォールバック ---
    if (shops.length === 0 && finalQuery) {
      try {
        const searchResponse = await callClaude(client, {
          system: SEARCH_SYSTEM_PROMPT,
          userContent: buildSearchPrompt({ query: finalQuery, condition }),
        });
        const searchParsed = parseJson(extractText(searchResponse.content));
        shops = cleanShops(searchParsed.shops);
        marketPrice = toNumber(searchParsed.marketPrice);
        notes = searchParsed.notes || null;
        priceSource = shops.length > 0 ? 'web' : 'none';
      } catch (error) {
        if (error.message !== 'REFUSAL') {
          console.error('fallback search error:', error);
        }
      }
    }

    const purchasePrice = manualPriceNum != null ? manualPriceNum : toNumber(extraction.purchase?.price);
    const pointsAmount = manualPointsNum != null ? manualPointsNum : toNumber(extraction.purchase?.pointsAmount);

    const result = {
      product: {
        name: extraction.product?.name || finalQuery || null,
        model: extraction.product?.model || null,
        category: extraction.product?.category || null,
        confidence: extraction.product?.confidence || null,
      },
      purchase: {
        price: purchasePrice,
        pointsAmount,
        pointsRate: extraction.purchase?.pointsRate || null,
      },
      condition: condition || null,
      shops,
      priceSource,
      marketPrice,
      notes,
      source: pageInfo ? { url: pageInfo.url, host: pageInfo.host, title: pageInfo.title } : null,
      warning:
        pageWarning ||
        (scannerError && shops.length === 0
          ? '買取スキャナーでの検索に失敗したため、Web検索の結果を表示しています'
          : scannerError
          ? '買取スキャナーでの検索に失敗しましたが、Web検索で価格を見つけました'
          : null),
      fetchedAt: new Date().toISOString(),
    };

    if (debugMode) {
      result.debug = {
        scannerStep: scannerError?.step || null,
        scannerMessage: scannerError?.message || null,
        scannerScreenshot: scannerError?.debugInfo?.screenshot || scannerResult?.debugInfo?.screenshot || null,
      };
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('lookup error:', error);

    if (error.message === 'REFUSAL') {
      return res.status(422).json({ error: 'この商品については回答できませんでした' });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: '混み合っています。少し待ってからもう一度お試しください' });
    }
    if (error instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `検索サービスのエラー (${error.status})` });
    }
    if (error instanceof ScannerError) {
      return res.status(502).json({ error: `買取スキャナーの検索に失敗しました（${error.message}）` });
    }
    return res.status(500).json({ error: '検索中にエラーが発生しました。もう一度お試しください' });
  }
}
