import { useState } from 'react';
import Head from 'next/head';

export default function Home() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const shopInfo = {
    '商店': { idRequired: '不要', cashOnDelivery: '○' },
    '海峡': { idRequired: '不要', cashOnDelivery: '○' },
    '海峡(モバイフ)': { idRequired: '不要', cashOnDelivery: '○' },
    'ルデヤ': { idRequired: '不要', cashOnDelivery: '×' },
    '市場': { idRequired: '不要', cashOnDelivery: '×' },
    'wiki': { idRequired: '必要', cashOnDelivery: '○' },
    '森森': { idRequired: '必要', cashOnDelivery: '○' },
    '一丁目': { idRequired: '必要', cashOnDelivery: '○' },
    'けんさく': { idRequired: '', cashOnDelivery: '' },
    'ホムヌ': { idRequired: '', cashOnDelivery: '' },
    'アハウテック': { idRequired: '', cashOnDelivery: '' },
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);

    if (files.length === 0) {
      setError('ファイルが選択されていません');
      return;
    }

    setError(null);
    setProcessing(true);
    setResults([]);
    setProgress({ current: 0, total: files.length });

    try {
      const analyzed = [];
      const errors = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ current: i + 1, total: files.length });

        try {
          if (!file || file.size === 0) {
            throw new Error('ファイルが空です');
          }

          if (file.size > 10 * 1024 * 1024) {
            throw new Error('ファイルサイズが大きすぎます（10MB以下）');
          }

const base64 = await new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      let width = img.width;
      let height = img.height;
      const maxSize = 1200;
      
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
      
      const compressed = canvas.toDataURL('image/jpeg', 0.7);
      resolve(compressed.split(',')[1]);
    };
    img.onerror = () => reject(new Error('画像読み込みエラー'));
    img.src = e.target.result;
  };
  reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
  reader.readAsDataURL(file);
});

          

          // バックエンドAPIを呼び出す
          const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ imageData: base64 }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'API呼び出しエラー');
          }

          const result = await response.json();

          if (result && result.productName && Array.isArray(result.shops)) {
            analyzed.push(result);
          } else {
            errors.push(`${file.name}: データ形式が不正`);
          }
        } catch (fileError) {
          errors.push(`${file.name}: ${fileError.message}`);
        }

        // レート制限対策
        if (i < files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (analyzed.length === 0) {
        throw new Error('すべてのファイルの解析に失敗しました\n\n' + errors.join('\n'));
      }

      setResults(analyzed);

      if (analyzed.length < files.length) {
        setError(`${files.length}件中${analyzed.length}件を解析しました。\n\n失敗:\n${errors.join('\n')}`);
      }
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const exportToCSV = () => {
    const allShops = results.flatMap(p => (p.shops || []).map(s => s.name));
    const shopNames = [...new Set(allShops)];

    let csv = '商品名,' + shopNames.join(',') + '\n';

    const idRow = ['身分証'];
    shopNames.forEach(shopName => {
      const info = shopInfo[shopName] || { idRequired: '', cashOnDelivery: '' };
      idRow.push(info.idRequired);
    });
    csv += idRow.join(',') + '\n';

    const codRow = ['着払い'];
    shopNames.forEach(shopName => {
      const info = shopInfo[shopName] || { idRequired: '', cashOnDelivery: '' };
      codRow.push(info.cashOnDelivery);
    });
    csv += codRow.join(',') + '\n';

    results.forEach(product => {
      const row = [product.productName || ''];

      shopNames.forEach(shopName => {
        const shops = product.shops || [];
        const shop = shops.find(s => s.name === shopName);
        row.push(shop && shop.buyPrice > 0 ? shop.buyPrice : '');
      });

      csv += row.join(',') + '\n';
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `買取価格比較_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <>
      <Head>
        <title>買取価格比較ツール</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-4 md:p-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">
              📊 買取価格比較ツール
            </h1>

            <div className="mb-8">
              <label className="block mb-4">
                <div className="border-2 border-dashed border-indigo-300 rounded-lg p-6 md:p-8 text-center hover:border-indigo-500 cursor-pointer transition-colors active:bg-indigo-50">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="text-4xl mb-3">📤</div>
                  <p className="text-gray-600 text-sm md:text-base">
                    スクリーンショットをアップロード
                    <span className="block text-xs md:text-sm text-gray-400 mt-1">
                      複数ファイル選択可能
                    </span>
                  </p>
                </div>
              </label>
            </div>

            {processing && (
              <div className="p-4 md:p-6 bg-blue-50 rounded-lg mb-6">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="text-blue-700 font-medium text-sm md:text-base">
                    解析中... ({progress.current}/{progress.total})
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
                <div className="text-red-700 text-sm md:text-base whitespace-pre-line">{error}</div>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="text-green-600 font-medium text-sm md:text-base">
                    ✅ {results.length}件の商品を解析しました
                  </div>
                  <button
                    onClick={exportToCSV}
                    className="w-full md:w-auto bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors font-medium"
                  >
                    💾 CSVダウンロード
                  </button>
                </div>

                <div className="overflow-x-auto border border-gray-300 rounded-lg">
                  <table className="w-full text-xs md:text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-200">
                        <th className="border border-gray-400 p-2 md:p-3 text-left font-bold sticky left-0 bg-gray-200 z-10 min-w-[120px]">
                          商品名
                        </th>
                        {(() => {
                          const allShops = results.flatMap(p => p.shops || []);
                          const uniqueShopNames = [...new Set(allShops.map(s => s.name))];
                          return uniqueShopNames.map((shopName, idx) => (
                            <th key={idx} className="border border-gray-400 p-2 md:p-3 text-center font-bold min-w-[80px]">
                              {shopName}
                            </th>
                          ));
                        })()}
                      </tr>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-400 p-1 md:p-2 text-left font-semibold sticky left-0 bg-gray-100 z-10">
                          身分証
                        </th>
                        {(() => {
                          const allShops = results.flatMap(p => p.shops || []);
                          const uniqueShopNames = [...new Set(allShops.map(s => s.name))];
                          return uniqueShopNames.map((shopName, idx) => {
                            const info = shopInfo[shopName] || { idRequired: '', cashOnDelivery: '' };
                            const bgColor = info.idRequired === '必要' ? 'bg-yellow-300' :
                              info.idRequired === '不要' ? 'bg-blue-300' : '';
                            return (
                              <th key={idx} className={`border border-gray-400 p-1 md:p-2 text-center ${bgColor}`}>
                                {info.idRequired}
                              </th>
                            );
                          });
                        })()}
                      </tr>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-400 p-1 md:p-2 text-left font-semibold sticky left-0 bg-gray-100 z-10">
                          着払い
                        </th>
                        {(() => {
                          const allShops = results.flatMap(p => p.shops || []);
                          const uniqueShopNames = [...new Set(allShops.map(s => s.name))];
                          return uniqueShopNames.map((shopName, idx) => {
                            const info = shopInfo[shopName] || { idRequired: '', cashOnDelivery: '' };
                            const bgColor = info.cashOnDelivery === '○' ? 'bg-blue-300' :
                              info.cashOnDelivery === '×' ? 'bg-yellow-300' : '';
                            return (
                              <th key={idx} className={`border border-gray-400 p-1 md:p-2 text-center ${bgColor}`}>
                                {info.cashOnDelivery}
                              </th>
                            );
                          });
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((product, idx) => {
                        const allShops = results.flatMap(p => p.shops || []);
                        const shopNames = [...new Set(allShops.map(s => s.name))];
                        const validPrices = (product.shops || []).filter(s => s.buyPrice > 0).map(s => s.buyPrice);
                        const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 0;

                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="border border-gray-400 p-2 md:p-3 font-medium sticky left-0 bg-white text-xs md:text-sm">
                              {product.productName}
                            </td>
                            {shopNames.map((shopName, shopIdx) => {
                              const shops = product.shops || [];
                              const shop = shops.find(s => s.name === shopName);
                              const price = shop && shop.buyPrice > 0 ? shop.buyPrice : null;
                              const isMax = price === maxPrice && maxPrice > 0;

                              return (
                                <td
                                  key={shopIdx}
                                  className={`border border-gray-400 p-2 md:p-3 text-center ${isMax ? 'bg-cyan-400 font-bold text-black' : ''
                                    }`}
                                >
                                  {price ? price.toLocaleString() : ''}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="text-xs md:text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
                  <p className="font-semibold mb-2">📝 注意事項：</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>シアン（水色）のセルが各商品の最高買取価格です</li>
                    <li>CSVファイルはExcelやGoogleスプレッドシートで開けます</li>
                    <li>iPhoneの場合、「ファイル」アプリに保存されます</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </>
  );
}
