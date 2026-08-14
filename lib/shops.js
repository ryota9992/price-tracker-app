// 買取価格を調べる対象の主な買取店。
// Claudeにはこのリストを「優先的に見る店」として渡すだけで、
// ここに無い店（フリマ相場・専門店など）が見つかった場合も結果に含めてよい。
export const TARGET_SHOPS = [
  { name: 'イオシス', site: 'iosys.co.jp', category: 'スマホ・PC' },
  { name: 'じゃんぱら', site: 'janpara.co.jp', category: 'スマホ・PC' },
  { name: 'ゲオモバイル', site: 'geo-mobile.jp', category: 'スマホ・ゲーム' },
  { name: 'ソフマップ', site: 'sofmap.com', category: 'スマホ・PC・家電' },
  { name: '携帯市場', site: 'keitaiichiba.co.jp', category: 'スマホ' },
  { name: '買取王子', site: 'kaitoriouji.jp', category: '総合' },
  { name: 'ブックオフ', site: 'bookoff.co.jp', category: '総合・書籍・ゲーム' },
  { name: '駿河屋', site: 'suruga-ya.jp', category: 'ホビー・ゲーム' },
  { name: 'エコリング', site: 'eco-ring.com', category: 'ブランド・貴金属' },
  { name: '大黒屋', site: 'e-daikoku.com', category: 'ブランド・時計' },
  { name: 'ネットオフ', site: 'netoff.co.jp', category: '書籍・メディア' },
  { name: 'ハードオフ', site: 'hardoff.co.jp', category: '家電・楽器' },
];

export function shopHintText() {
  return TARGET_SHOPS.map((s) => `- ${s.name}（${s.site} / ${s.category}）`).join('\n');
}
