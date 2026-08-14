import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const CONDITIONS = [
  { value: '未使用・新品同様（未開封または未使用、付属品完備）', label: '未使用' },
  { value: '中古・美品（付属品あり、動作正常、傷ほとんどなし）', label: '美品' },
  { value: '中古・通常（使用感あり、動作正常）', label: '通常' },
  { value: '中古・難あり（傷や不具合あり、ジャンク扱いの可能性）', label: '難あり' },
];

// ショートカットや共有シートは URL 単体ではなく本文ごと渡してくることがある
function extractUrl(value) {
  if (!value) return null;
  const match = value.match(/https?:\/\/[^\s"'<>]+/);
  return match ? match[0] : null;
}

function yen(value) {
  return typeof value === 'number' ? `¥${value.toLocaleString('ja-JP')}` : '—';
}

export default function Check() {
  const [target, setTarget] = useState({ url: null, productName: '' });
  const [condition, setCondition] = useState(CONDITIONS[1].value);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const startedFor = useRef(null);

  const runLookup = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '検索に失敗しました');
      }
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 共有シート／ブックマークレットから渡されたURLで自動的に検索を開始する
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // ハッシュ（#u=...）も見る。共有シート経由だと & を含むURLがクエリだと分断されるため。
    const raw =
      params.get('url') ||
      params.get('u') ||
      params.get('text') ||
      decodeURIComponent(window.location.hash.replace(/^#(url=|u=)?/, ''));
    const url = extractUrl(raw);

    if (url) {
      setTarget({ url, productName: '' });
      if (startedFor.current !== url) {
        startedFor.current = url;
        runLookup({ url, condition: CONDITIONS[1].value });
      }
    }
  }, [runLookup]);

  useEffect(() => {
    if (!loading) return undefined;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  const submit = (e) => {
    e.preventDefault();
    const url = extractUrl(target.url || target.productName);
    const productName = target.productName.trim();

    if (!url && !productName) {
      setError('URLか商品名を入力してください');
      return;
    }
    runLookup({ url, productName: url ? undefined : productName, condition });
  };

  const rerun = () => {
    runLookup({
      url: target.url || undefined,
      productName: target.url ? undefined : target.productName.trim(),
      condition,
    });
  };

  const shareResult = async () => {
    if (!result) return;

    const lines = [
      `${result.product?.name || '商品'} の買取価格`,
      ...result.shops.map((s) => `${s.name}: ${yen(s.price)}`),
    ];
    const text = lines.join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: '買取価格', text });
        return;
      } catch {
        // 共有をキャンセルした場合はコピーにフォールバック
      }
    }
    await navigator.clipboard.writeText(text);
    alert('結果をコピーしました');
  };

  const best = result?.shops?.[0] || null;

  return (
    <>
      <Head>
        <title>買取価格をチェック</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 pb-16">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">🔍 買取価格チェック</h1>
            <Link href="/setup" className="text-sm text-indigo-600 underline">
              使い方
            </Link>
          </div>

          <form onSubmit={submit} className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
            {target.url ? (
              <div className="text-xs text-gray-500 break-all bg-gray-50 rounded-lg p-3">
                対象ページ: {target.url}
              </div>
            ) : (
              <input
                type="text"
                inputMode="search"
                value={target.productName}
                onChange={(e) => setTarget({ url: null, productName: e.target.value })}
                placeholder="商品名またはURLを貼り付け"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            )}

            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCondition(c.value)}
                  className={`px-3 py-2 rounded-full text-sm border transition-colors ${
                    condition === c.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium active:bg-indigo-800 disabled:bg-gray-400"
            >
              {loading ? `検索中... ${elapsed}秒` : '買取価格を調べる'}
            </button>

            {target.url && (
              <button
                type="button"
                onClick={() => setTarget({ url: null, productName: '' })}
                className="w-full text-sm text-gray-500 underline"
              >
                商品名を手入力して調べ直す
              </button>
            )}
          </form>

          {loading && (
            <div className="bg-white rounded-2xl shadow p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">各買取店の価格を検索しています</p>
              <p className="text-gray-400 text-sm mt-1">Web検索を行うため30〜60秒ほどかかります</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <p className="text-red-700 text-sm whitespace-pre-line">{error}</p>
              <button onClick={rerun} className="text-sm text-red-700 underline">
                もう一度試す
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {result.warning && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  {result.warning}
                </div>
              )}

              <div className="bg-white rounded-2xl shadow-lg p-4">
                <div className="text-xs text-gray-400 mb-1">
                  {result.product?.category || '商品'}
                  {result.product?.confidence === 'low' && '・商品の特定に自信なし'}
                </div>
                <h2 className="text-lg font-bold text-gray-800">{result.product?.name || '不明な商品'}</h2>
                {result.condition && (
                  <p className="text-sm text-gray-500 mt-1">前提: {result.condition}</p>
                )}

                {best ? (
                  <div className="mt-4 bg-cyan-50 border border-cyan-300 rounded-xl p-4">
                    <div className="text-xs text-cyan-800 font-medium">最高買取価格</div>
                    <div className="text-3xl font-bold text-cyan-900">{yen(best.price)}</div>
                    <div className="text-sm text-cyan-800 mt-1">{best.name}</div>
                  </div>
                ) : (
                  <p className="mt-4 text-gray-600 text-sm">
                    買取価格を掲載しているページが見つかりませんでした。
                  </p>
                )}

                {(result.marketPrice || result.product?.listPrice) && (
                  <div className="mt-3 flex gap-4 text-sm text-gray-600">
                    {result.product?.listPrice && <span>販売価格 {yen(result.product.listPrice)}</span>}
                    {result.marketPrice && <span>フリマ相場 {yen(result.marketPrice)}</span>}
                  </div>
                )}
              </div>

              {result.shops.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                  <ul className="divide-y divide-gray-100">
                    {result.shops.map((shop, idx) => (
                      <li key={`${shop.name}-${idx}`} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-800">
                              {idx === 0 && <span className="mr-1">👑</span>}
                              {shop.name}
                            </div>
                            {shop.condition && (
                              <div className="text-xs text-gray-500 mt-0.5">{shop.condition}</div>
                            )}
                            {shop.note && (
                              <div className="text-xs text-gray-500 mt-0.5">{shop.note}</div>
                            )}
                            {shop.url && (
                              <a
                                href={shop.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 underline mt-1 inline-block"
                              >
                                買取ページを開く
                              </a>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={`text-lg font-bold ${
                                idx === 0 ? 'text-cyan-700' : 'text-gray-800'
                              }`}
                            >
                              {yen(shop.price)}
                            </div>
                            {best && idx > 0 && (
                              <div className="text-xs text-gray-400">
                                −{yen(best.price - shop.price)}
                              </div>
                            )}
                            {shop.asOf && <div className="text-xs text-gray-400">{shop.asOf}</div>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.notes && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
                  {result.notes}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={shareResult}
                  className="flex-1 bg-white border border-indigo-300 text-indigo-700 py-3 rounded-lg font-medium"
                >
                  結果を共有
                </button>
                <button
                  onClick={rerun}
                  className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium"
                >
                  再検索
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center">
                価格はWeb検索で見つけた掲載値です。実際の査定額は状態・時期で変わります。
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
