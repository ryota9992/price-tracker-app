import { useState, useEffect } from 'react';
import Head from 'next/head';

// Shipping options for each platform
const SHIPPING_OPTIONS = [
  { label: 'ネコポス', cost: 210 },
  { label: '宅急便コンパクト', cost: 450 },
  { label: '宅急便(60)', cost: 750 },
  { label: '宅急便(80)', cost: 870 },
  { label: '宅急便(100)', cost: 1050 },
  { label: '宅急便(140)', cost: 1400 },
  { label: '宅急便(160)', cost: 1600 },
  { label: '着払い/手渡し', cost: 0 },
];

const PLATFORM_FEE = { mercari: 0.10, rakuma: 0.06 };

const STATUS_CONFIG = {
  in_stock: { label: '在庫中', color: 'bg-blue-100 text-blue-800' },
  listed:   { label: '出品中', color: 'bg-yellow-100 text-yellow-800' },
  sold:     { label: '売却済', color: 'bg-green-100 text-green-800' },
};

function calcProfit({ buyPrice, sellPrice, platform, shippingCost }) {
  const fee = sellPrice * PLATFORM_FEE[platform];
  const net = sellPrice - fee - shippingCost - buyPrice;
  const roi = buyPrice > 0 ? (net / buyPrice) * 100 : 0;
  return { net: Math.round(net), roi: Math.round(roi * 10) / 10, fee: Math.round(fee) };
}

// ── Profit Calculator Tab ──────────────────────────────────────────────────
function CalcTab({ onAddToInventory }) {
  const [form, setForm] = useState({
    name: '',
    buyPrice: '',
    sellPrice: '',
    platform: 'mercari',
    shippingIdx: 0,
    minProfit: 500,
    minRoi: 20,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const buyPrice = Number(form.buyPrice) || 0;
  const sellPrice = Number(form.sellPrice) || 0;
  const shippingCost = SHIPPING_OPTIONS[form.shippingIdx].cost;
  const ready = buyPrice > 0 && sellPrice > 0;
  const { net, roi, fee } = ready ? calcProfit({ buyPrice, sellPrice, platform: form.platform, shippingCost }) : { net: 0, roi: 0, fee: 0 };
  const isGo = ready && net >= form.minProfit && roi >= form.minRoi;
  const isNg = ready && (net < form.minProfit || roi < form.minRoi);

  const handleAdd = () => {
    if (!ready) return;
    onAddToInventory({
      name: form.name || '商品名未入力',
      buyPrice,
      sellPrice,
      platform: form.platform,
      shippingCost,
    });
    set('name', '');
    set('buyPrice', '');
    set('sellPrice', '');
  };

  return (
    <div className="space-y-5">
      {/* Input */}
      <div className="bg-white rounded-2xl shadow p-5 space-y-4">
        <h2 className="font-bold text-gray-700">仕入れ情報を入力</h2>
        <div>
          <label className="text-xs font-medium text-gray-500">商品名（任意）</label>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="例: ポケモンカード 拡張パック"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">仕入れ価格（円）</label>
            <input
              type="number"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="500"
              value={form.buyPrice}
              onChange={e => set('buyPrice', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">想定売価（円）</label>
            <input
              type="number"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="1200"
              value={form.sellPrice}
              onChange={e => set('sellPrice', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">販売先</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={form.platform}
              onChange={e => set('platform', e.target.value)}
            >
              <option value="mercari">メルカリ（手数料10%）</option>
              <option value="rakuma">ラクマ（手数料6%）</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">配送方法</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={form.shippingIdx}
              onChange={e => set('shippingIdx', Number(e.target.value))}
            >
              {SHIPPING_OPTIONS.map((o, i) => (
                <option key={i} value={i}>{o.label}（¥{o.cost}）</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Result */}
      {ready && (
        <div className={`rounded-2xl shadow p-5 ${isGo ? 'bg-green-50 border-2 border-green-400' : 'bg-red-50 border-2 border-red-400'}`}>
          <div className="flex items-center justify-between mb-4">
            <span className={`text-3xl font-black tracking-wide ${isGo ? 'text-green-600' : 'text-red-600'}`}>
              {isGo ? '✅ GO' : '❌ NG'}
            </span>
            <div className="text-right">
              <div className={`text-2xl font-bold ${net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {net >= 0 ? '+' : ''}{net.toLocaleString()}円
              </div>
              <div className="text-sm text-gray-500">利益 / ROI {roi}%</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm text-center">
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 text-xs">売上</div>
              <div className="font-semibold">{sellPrice.toLocaleString()}円</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 text-xs">手数料</div>
              <div className="font-semibold text-orange-500">-{fee.toLocaleString()}円</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-gray-400 text-xs">送料</div>
              <div className="font-semibold text-orange-500">-{shippingCost.toLocaleString()}円</div>
            </div>
          </div>

          {ready && (
            <button
              onClick={handleAdd}
              className="mt-4 w-full bg-indigo-600 text-white py-2 rounded-xl font-semibold text-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
            >
              在庫リストに追加 →
            </button>
          )}
        </div>
      )}

      {/* Threshold settings */}
      <div className="bg-white rounded-2xl shadow p-5">
        <h3 className="font-bold text-gray-700 mb-3 text-sm">GO判定の閾値</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">最低利益（円）</label>
            <input
              type="number"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={form.minProfit}
              onChange={e => set('minProfit', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">最低ROI（%）</label>
            <input
              type="number"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={form.minRoi}
              onChange={e => set('minRoi', Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inventory Tab ──────────────────────────────────────────────────────────
function InventoryTab({ items, onUpdateStatus, onDelete, onSold }) {
  const [filter, setFilter] = useState('all');
  const [soldPrice, setSoldPrice] = useState({});

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2">
        {[['all', 'すべて'], ['in_stock', '在庫中'], ['listed', '出品中'], ['sold', '売却済']].map(([val, lbl]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === val ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
          >
            {lbl}
            <span className="ml-1 opacity-70">
              {val === 'all' ? items.length : items.filter(i => i.status === val).length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          {items.length === 0 ? '利益計算タブから商品を追加してください' : '該当する商品はありません'}
        </div>
      )}

      {filtered.map(item => {
        const { net, roi } = calcProfit({
          buyPrice: item.buyPrice,
          sellPrice: item.status === 'sold' ? item.soldPrice : item.sellPrice,
          platform: item.platform,
          shippingCost: item.shippingCost,
        });
        const statusCfg = STATUS_CONFIG[item.status];

        return (
          <div key={item.id} className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{item.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {item.platform === 'mercari' ? 'メルカリ' : 'ラクマ'} · {item.date}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs text-center mb-3">
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-gray-400">仕入値</div>
                <div className="font-bold text-gray-700">{item.buyPrice.toLocaleString()}円</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-gray-400">{item.status === 'sold' ? '売却価格' : '想定売価'}</div>
                <div className="font-bold text-gray-700">
                  {(item.status === 'sold' ? item.soldPrice : item.sellPrice).toLocaleString()}円
                </div>
              </div>
              <div className={`rounded-lg p-2 ${net >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="text-gray-400">利益</div>
                <div className={`font-bold ${net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {net >= 0 ? '+' : ''}{net.toLocaleString()}円
                </div>
              </div>
            </div>

            {/* Actions by status */}
            {item.status === 'in_stock' && (
              <div className="flex gap-2">
                <button
                  onClick={() => onUpdateStatus(item.id, 'listed')}
                  className="flex-1 bg-yellow-500 text-white text-xs py-1.5 rounded-lg font-medium hover:bg-yellow-600 transition-colors"
                >
                  出品済みにする
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="px-3 bg-gray-200 text-gray-600 text-xs py-1.5 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  削除
                </button>
              </div>
            )}
            {item.status === 'listed' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                    placeholder={`実売価格（想定: ${item.sellPrice.toLocaleString()}円）`}
                    value={soldPrice[item.id] || ''}
                    onChange={e => setSoldPrice(p => ({ ...p, [item.id]: e.target.value }))}
                  />
                  <button
                    onClick={() => {
                      onSold(item.id, Number(soldPrice[item.id]) || item.sellPrice);
                      setSoldPrice(p => { const n = { ...p }; delete n[item.id]; return n; });
                    }}
                    className="px-3 bg-green-600 text-white text-xs py-1.5 rounded-lg font-medium hover:bg-green-700 transition-colors"
                  >
                    売却完了
                  </button>
                </div>
                <button
                  onClick={() => onUpdateStatus(item.id, 'in_stock')}
                  className="w-full bg-gray-200 text-gray-600 text-xs py-1.5 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  在庫中に戻す
                </button>
              </div>
            )}
            {item.status === 'sold' && (
              <div className="text-xs text-gray-400 text-right">
                売却日: {item.soldDate} · ROI {roi}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Summary Tab ────────────────────────────────────────────────────────────
function SummaryTab({ items }) {
  const sold = items.filter(i => i.status === 'sold');
  const inStock = items.filter(i => i.status === 'in_stock');
  const listed = items.filter(i => i.status === 'listed');

  const totalProfit = sold.reduce((sum, item) => {
    const { net } = calcProfit({ buyPrice: item.buyPrice, sellPrice: item.soldPrice, platform: item.platform, shippingCost: item.shippingCost });
    return sum + net;
  }, 0);

  const totalInvested = inStock.reduce((s, i) => s + i.buyPrice, 0)
    + listed.reduce((s, i) => s + i.buyPrice, 0);

  const avgRoi = sold.length > 0
    ? sold.reduce((sum, item) => {
        const { roi } = calcProfit({ buyPrice: item.buyPrice, sellPrice: item.soldPrice, platform: item.platform, shippingCost: item.shippingCost });
        return sum + roi;
      }, 0) / sold.length
    : 0;

  const statCard = (label, value, sub, color = 'text-gray-800') => (
    <div className="bg-white rounded-2xl shadow p-4 text-center">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {statCard('累計利益', `${totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString()}円`, `${sold.length}件 売却済`, totalProfit >= 0 ? 'text-green-600' : 'text-red-600')}
        {statCard('平均ROI', `${Math.round(avgRoi * 10) / 10}%`, sold.length > 0 ? `${sold.length}件平均` : '売却実績なし')}
        {statCard('在庫中', `${inStock.length}件`, `投資額 ¥${totalInvested.toLocaleString()}`)}
        {statCard('出品中', `${listed.length}件`, listed.length > 0 ? `¥${listed.reduce((s, i) => s + i.buyPrice, 0).toLocaleString()} 仕入済` : '—')}
      </div>

      {sold.length > 0 && (
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="font-bold text-gray-700 text-sm mb-3">売却履歴</h3>
          <div className="space-y-2">
            {sold.slice().reverse().map(item => {
              const { net, roi } = calcProfit({ buyPrice: item.buyPrice, sellPrice: item.soldPrice, platform: item.platform, shippingCost: item.shippingCost });
              return (
                <div key={item.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="font-medium text-gray-700">{item.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{item.soldDate}</span>
                  </div>
                  <div className="text-right">
                    <span className={`font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {net >= 0 ? '+' : ''}{net.toLocaleString()}円
                    </span>
                    <span className="text-xs text-gray-400 ml-1">ROI {roi}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          利益計算タブで商品を追加すると集計が表示されます
        </div>
      )}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('calc');
  const [items, setItems] = useState([]);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sedori_items');
      if (saved) setItems(JSON.parse(saved));
    } catch (_) {}
  }, []);

  const save = (newItems) => {
    setItems(newItems);
    localStorage.setItem('sedori_items', JSON.stringify(newItems));
  };

  const addItem = ({ name, buyPrice, sellPrice, platform, shippingCost }) => {
    const item = {
      id: Date.now().toString(),
      name,
      buyPrice,
      sellPrice,
      platform,
      shippingCost,
      status: 'in_stock',
      soldPrice: 0,
      date: new Date().toLocaleDateString('ja-JP'),
      soldDate: '',
    };
    save([...items, item]);
    setTab('inventory');
  };

  const updateStatus = (id, status) => {
    save(items.map(i => i.id === id ? { ...i, status } : i));
  };

  const markSold = (id, soldPrice) => {
    save(items.map(i => i.id === id ? { ...i, status: 'sold', soldPrice, soldDate: new Date().toLocaleDateString('ja-JP') } : i));
  };

  const deleteItem = (id) => {
    if (confirm('この商品を削除しますか？')) save(items.filter(i => i.id !== id));
  };

  const TABS = [
    { id: 'calc', label: '利益計算', icon: '🧮' },
    { id: 'inventory', label: '在庫管理', icon: '📦', badge: items.filter(i => i.status !== 'sold').length },
    { id: 'summary', label: '集計', icon: '📊' },
  ];

  return (
    <>
      <Head>
        <title>せどり管理ツール</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Header */}
        <header className="bg-indigo-600 text-white px-4 py-3">
          <h1 className="font-bold text-lg">📦 せどり管理ツール</h1>
          <p className="text-indigo-200 text-xs">利益計算 · 在庫管理 · 売上集計</p>
        </header>

        {/* Tab bar */}
        <div className="bg-white border-b border-gray-200 flex">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-xs font-medium flex flex-col items-center gap-0.5 transition-colors relative ${tab === t.id ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <span className="text-base">{t.icon}</span>
              <span>{t.label}</span>
              {t.badge > 0 && (
                <span className="absolute top-2 right-1/4 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {t.badge > 9 ? '9+' : t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full">
          {tab === 'calc' && <CalcTab onAddToInventory={addItem} />}
          {tab === 'inventory' && <InventoryTab items={items} onUpdateStatus={updateStatus} onDelete={deleteItem} onSold={markSold} />}
          {tab === 'summary' && <SummaryTab items={items} />}
        </div>
      </div>
    </>
  );
}
