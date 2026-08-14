import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { shopBadge } from '../lib/shops';

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

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let width = img.width;
        let height = img.height;
        const maxSize = 1400;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        resolve({ dataUrl: compressed, base64: compressed.split(',')[1] });
      };
      img.onerror = () => reject(new Error('画像読み込みエラー'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
    reader.readAsDataURL(file);
  });
}

export default function Check() {
  const [mode, setMode] = useState('choose'); // choose | url | image | manual
  const [url, setUrl] = useState(null);
  const [productName, setProductName] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [condition, setCondition] = useState(CONDITIONS[1].value);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // 抽出結果の手直し用（編集すると再計算はサーバーを呼ばずその場で行う）
  const [priceInput, setPriceInput] = useState('');
  const [pointsInput, setPointsInput] = useState('');

  const startedFor = useRef(null);
  const fileInputRef = useRef(null);

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
      setPriceInput(data.purchase?.price != null ? String(data.purchase.price) : '');
      setPointsInput(data.purchase?.pointsAmount != null ? String(data.purchase.pointsAmount) : '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 共有シート／ブックマークレットから渡されたURLで自動的に検索を開始する
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw =
      params.get('url') ||
      params.get('u') ||
      params.get('text') ||
      decodeURIComponent(window.location.hash.replace(/^#(url=|u=)?/, ''));
    const sharedUrl = extractUrl(raw);

    if (sharedUrl) {
      setMode('url');
      setUrl(sharedUrl);
      if (startedFor.current !== sharedUrl) {
        startedFor.current = sharedUrl;
        runLookup({ url: sharedUrl, condition: CONDITIONS[1].value });
      }
    }
  }, [runLookup]);

  useEffect(() => {
    if (!loading) return undefined;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { dataUrl, base64 } = await compressImage(file);
      setImagePreview(dataUrl);
      setImageBase64(base64);
      setMode('image');
    } catch (err) {
      setError(err.message);
    }
  };

  const submitImage = () => {
    if (!imageBase64) return;
    runLookup({ imageData: imageBase64, condition });
  };

  const submitUrl = (e) => {
    e.preventDefault();
    const parsed = extractUrl(url);
    if (!parsed) {
      setError('正しいURLを入力してください');
      return;
    }
    setUrl(parsed);
    runLookup({ url: parsed, condition });
  };

  const submitManual = (e) => {
    e.preventDefault();
    if (!productName.trim()) {
      setError('商品名を入力してください');
      return;
    }
    runLookup({ productName: productName.trim(), condition });
  };

  const reset = () => {
    setMode('choose');
    setUrl(null);
    setProductName('');
    setImagePreview(null);
    setImageBase64(null);
    setResult(null);
    setError(null);
    startedFor.current = null;
  };

  const rerunWithOverrides = () => {
    const manualPrice = priceInput.trim() ? Number(priceInput.replace(/[^\d]/g, '')) : null;
    const manualPoints = pointsInput.trim() ? Number(pointsInput.replace(/[^\d]/g, '')) : null;

    if (mode === 'url' && url) {
      runLookup({ url, condition, manualPrice, manualPoints });
    } else if (mode === 'image' && imageBase64) {
      runLookup({ imageData: imageBase64, condition, manualPrice, manualPoints });
    } else if (mode === 'manual' && productName) {
      runLookup({ productName, condition, manualPrice, manualPoints });
    }
  };

  // 価格・ポイントの手入力欄を編集した瞬間に、通信なしで利益を再計算する
  const editedPrice = priceInput.trim() ? Number(priceInput.replace(/[^\d]/g, '')) : null;
  const editedPoints = pointsInput.trim() ? Number(pointsInput.replace(/[^\d]/g, '')) : null;

  const bestShop = result?.shops?.[0] || null;

  const calc = useMemo(() => {
    if (!bestShop || editedPrice == null) return null;
    const effectivePrice = editedPrice - (editedPoints || 0);
    const profit = bestShop.price - effectivePrice;
    return { effectivePrice, profit };
  }, [bestShop, editedPrice, editedPoints]);

  return (
    <>
      <Head>
        <title>買取利益チェック</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 pb-16">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">💰 買取利益チェック</h1>
            <Link href="/setup" className="text-sm text-indigo-600 underline">
              使い方
            </Link>
          </div>

          {mode === 'choose' && !loading && (
            <div className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
              <p className="text-sm text-gray-600">
                商品ページのスクリーンショット、またはURLから、購入額・ポイント・買取価格の差引利益を調べます。
              </p>

              <label className="block">
                <div className="border-2 border-dashed border-indigo-300 rounded-lg p-6 text-center active:bg-indigo-50 cursor-pointer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImagePick}
                    className="hidden"
                  />
                  <div className="text-3xl mb-2">📤</div>
                  <p className="text-gray-700 font-medium">スクリーンショットを選択</p>
                  <p className="text-gray-400 text-xs mt-1">価格・ポイント表示ごと写っているもの</p>
                </div>
              </label>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="flex-1 h-px bg-gray-200" />
                または
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <form onSubmit={submitUrl} className="space-y-2">
                <input
                  type="text"
                  inputMode="url"
                  value={url || ''}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="商品ページのURLを貼り付け"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium active:bg-indigo-800"
                >
                  URLから調べる
                </button>
              </form>

              <button
                type="button"
                onClick={() => setMode('manual')}
                className="w-full text-sm text-gray-500 underline pt-1"
              >
                商品名だけで調べる
              </button>
            </div>
          )}

          {mode === 'manual' && !loading && !result && (
            <form onSubmit={submitManual} className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
              <input
                type="text"
                inputMode="search"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="商品名（例: あつまれ どうぶつの森 Switch2 Edition）"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium active:bg-indigo-800"
              >
                買取価格を調べる
              </button>
              <button type="button" onClick={reset} className="w-full text-sm text-gray-500 underline">
                戻る
              </button>
            </form>
          )}

          {mode === 'image' && imagePreview && !loading && !result && (
            <div className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="選択したスクリーンショット" className="w-full rounded-lg border" />
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
                onClick={submitImage}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium active:bg-indigo-800"
              >
                この画像で調べる
              </button>
              <button onClick={reset} className="w-full text-sm text-gray-500 underline">
                やり直す
              </button>
            </div>
          )}

          {mode === 'url' && url && !loading && !result && (
            <div className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
              <div className="text-xs text-gray-500 break-all bg-gray-50 rounded-lg p-3">対象ページ: {url}</div>
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
                onClick={() => runLookup({ url, condition })}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium active:bg-indigo-800"
              >
                このページで調べる
              </button>
              <button onClick={reset} className="w-full text-sm text-gray-500 underline">
                やり直す
              </button>
            </div>
          )}

          {loading && (
            <div className="bg-white rounded-2xl shadow p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">価格・買取相場を確認しています</p>
              <p className="text-gray-400 text-sm mt-1">Web検索を行うため30〜60秒ほどかかります（{elapsed}秒経過）</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <p className="text-red-700 text-sm whitespace-pre-line">{error}</p>
              <button onClick={rerunWithOverrides} className="text-sm text-red-700 underline">
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
              </div>

              {/* 利益判定カード */}
              <div
                className={`rounded-2xl shadow-lg p-5 border-2 ${
                  calc && calc.profit > 0
                    ? 'bg-green-50 border-green-400'
                    : calc && calc.profit <= 0
                    ? 'bg-red-50 border-red-300'
                    : 'bg-white border-gray-200'
                }`}
              >
                {calc ? (
                  <>
                    <div className="text-xs font-medium text-gray-500">差引利益（買取額 − 実質購入額）</div>
                    <div
                      className={`text-4xl font-bold mt-1 ${
                        calc.profit > 0 ? 'text-green-700' : 'text-red-600'
                      }`}
                    >
                      {calc.profit > 0 ? '+' : ''}
                      {yen(calc.profit)}
                    </div>
                    <div className={`text-sm font-bold mt-1 ${calc.profit > 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {calc.profit > 0 ? '🟢 買い時（利益が出ます）' : '🔴 このままだと損します'}
                    </div>
                  </>
                ) : (
                  <div className="text-gray-500 text-sm">購入価格が分からないため利益を計算できません。下の欄に入力してください。</div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">購入価格</label>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">¥</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        className="w-full border-b border-gray-300 bg-transparent py-1 text-lg focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">ポイント還元額</label>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">¥</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={pointsInput}
                        onChange={(e) => setPointsInput(e.target.value)}
                        className="w-full border-b border-gray-300 bg-transparent py-1 text-lg focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    {result.purchase?.pointsRate && (
                      <div className="text-xs text-gray-400 mt-0.5">還元率: {result.purchase.pointsRate}</div>
                    )}
                  </div>
                </div>

                {calc && (
                  <div className="mt-3 flex justify-between text-sm text-gray-600 bg-white/60 rounded-lg px-3 py-2">
                    <span>実質購入額</span>
                    <span className="font-medium">{yen(calc.effectivePrice)}</span>
                  </div>
                )}

                <button
                  onClick={rerunWithOverrides}
                  className="w-full mt-3 bg-white border border-indigo-300 text-indigo-700 py-2 rounded-lg text-sm font-medium"
                >
                  修正した金額で買取価格を再検索
                </button>
              </div>

              {result.shops.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                  <div className="px-4 pt-3 text-xs text-gray-400">買取価格（高い順）</div>
                  <ul className="divide-y divide-gray-100">
                    {result.shops.map((shop, idx) => {
                      const badge = shopBadge(shop.name);
                      return (
                        <li key={`${shop.name}-${idx}`} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-gray-800">
                                {idx === 0 && <span className="mr-1">👑</span>}
                                {shop.name}
                              </div>
                              <div className="flex gap-2 mt-1 flex-wrap">
                                {shop.condition && (
                                  <span className="text-xs text-gray-500">{shop.condition}</span>
                                )}
                                {badge?.idRequired && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">
                                    身分証{badge.idRequired}
                                  </span>
                                )}
                                {badge?.cashOnDelivery && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                                    着払い{badge.cashOnDelivery}
                                  </span>
                                )}
                              </div>
                              {shop.note && <div className="text-xs text-gray-500 mt-0.5">{shop.note}</div>}
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
                              <div className={`text-lg font-bold ${idx === 0 ? 'text-indigo-700' : 'text-gray-800'}`}>
                                {yen(shop.price)}
                              </div>
                              {shop.asOf && <div className="text-xs text-gray-400">{shop.asOf}</div>}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {result.notes && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
                  {result.notes}
                </div>
              )}

              <button onClick={reset} className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium">
                別の商品を調べる
              </button>

              <p className="text-xs text-gray-400 text-center">
                価格はWeb検索で見つけた掲載値です。実際の査定額・ポイント条件は状態や時期で変わります。
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
