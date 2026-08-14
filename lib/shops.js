// 買取価格を調べる対象の買取店。
// site があるものはWeb検索の手がかりとして使う。
// idRequired / cashOnDelivery は結果表示のバッジに使う（不明なら null）。
export const TARGET_SHOPS = [
  { name: 'イオシス', site: 'iosys.co.jp', category: 'スマホ・PC', idRequired: null, cashOnDelivery: null },
  { name: 'じゃんぱら', site: 'janpara.co.jp', category: 'スマホ・PC', idRequired: null, cashOnDelivery: null },
  { name: 'ゲオモバイル', site: 'geo-mobile.jp', category: 'スマホ・ゲーム', idRequired: null, cashOnDelivery: null },
  { name: 'ソフマップ', site: 'sofmap.com', category: 'スマホ・PC・家電', idRequired: null, cashOnDelivery: null },
  { name: '携帯市場', site: 'keitaiichiba.co.jp', category: 'スマホ', idRequired: null, cashOnDelivery: null },
  { name: '買取王子', site: 'kaitoriouji.jp', category: '総合', idRequired: null, cashOnDelivery: null },
  { name: 'ブックオフ', site: 'bookoff.co.jp', category: '総合・書籍・ゲーム', idRequired: null, cashOnDelivery: null },
  { name: '駿河屋', site: 'suruga-ya.jp', category: 'ホビー・ゲーム', idRequired: null, cashOnDelivery: null },
  { name: 'エコリング', site: 'eco-ring.com', category: 'ブランド・貴金属', idRequired: null, cashOnDelivery: null },
  { name: '大黒屋', site: 'e-daikoku.com', category: 'ブランド・時計', idRequired: null, cashOnDelivery: null },
  { name: 'ネットオフ', site: 'netoff.co.jp', category: '書籍・メディア', idRequired: null, cashOnDelivery: null },
  { name: 'ハードオフ', site: 'hardoff.co.jp', category: '家電・楽器', idRequired: null, cashOnDelivery: null },
  // 以前の比較表で使っていた店舗（ドメイン不明のため検索ヒントには使わないが、
  // 結果に同名の店が出た場合はこのバッジ情報を表示する）
  { name: '商店', site: null, category: null, idRequired: '不要', cashOnDelivery: '○' },
  { name: '海峡', site: null, category: null, idRequired: '不要', cashOnDelivery: '○' },
  { name: '海峡(モバイフ)', site: null, category: null, idRequired: '不要', cashOnDelivery: '○' },
  { name: 'ルデヤ', site: null, category: null, idRequired: '不要', cashOnDelivery: '×' },
  { name: '市場', site: null, category: null, idRequired: '不要', cashOnDelivery: '×' },
  { name: 'wiki', site: null, category: null, idRequired: '必要', cashOnDelivery: '○' },
  { name: '森森', site: null, category: null, idRequired: '必要', cashOnDelivery: '○' },
  { name: '一丁目', site: null, category: null, idRequired: '必要', cashOnDelivery: '○' },
  { name: 'けんさく', site: null, category: null, idRequired: null, cashOnDelivery: null },
  { name: 'ホムヌ', site: null, category: null, idRequired: null, cashOnDelivery: null },
  { name: 'アハウテック', site: null, category: null, idRequired: null, cashOnDelivery: null },
];

export function shopHintText() {
  return TARGET_SHOPS.filter((s) => s.site)
    .map((s) => `- ${s.name}（${s.site} / ${s.category}）`)
    .join('\n');
}

export function shopBadge(name) {
  return TARGET_SHOPS.find((s) => s.name === name) || null;
}
