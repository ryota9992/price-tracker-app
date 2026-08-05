/**
 * Moneytree の口座残高を「取込」シート経由でシート7に転記する。
 *
 * 運用:
 *   1. 週次トリガー（asset-sheet-weekly.gs）が新しい日付列を追加する
 *   2. Moneytree の口座残高画面のスクショから「口座名 / 金額」を取込シートに貼る
 *   3. importBalances() を実行すると、最新の日付列に書き込まれる
 *
 * 設計上の要点:
 *   - シート7の行番号はハードコードしない。大分類/中分類/項目 で行を引く
 *   - マッピングに無い行には一切触らない。小計行の数式と、
 *     手入力する証券行（亮太・明子・結楓・結依）は保護される
 *   - 複数のカードを1行に合算できる（楽天亮太の Visa と Mastercard など）
 *   - 負債は Moneytree ではマイナス表示、シートではプラス表記なので絶対値で書く
 */

const IMPORT_CONFIG = {
  spreadsheetId: '1XauPN5Kl-Mw2j8OMxJkATCmDsGDyqybLZFHAjhqW0_0',
  sheetName: 'シート7',
  importSheetName: '取込',

  // 大分類・中分類の列（B列・C列）と項目の列（D列）。
  // 縦方向に結合されている場合は上から値を引き継いで解決する。
  majorCol: 2,
  minorCol: 3,
  itemCol: 4,
};

/**
 * Moneytree の表示名 → シート7の行（大分類/中分類/項目）。
 *
 * source は Moneytree の口座残高画面に出る名前。前後の空白は無視し、
 * 完全一致で引く。表記が変わったらここだけ直せばよい。
 *
 * 同じ target を複数の source が指す場合は合算される。
 */
const MAPPING = [
  // 銀行
  { source: 'みずほ銀行 普通', target: '資産/銀行/みずほ' },
  { source: '三菱UFJ銀行 普通', target: '資産/銀行/三菱UFJ（亮太）' },

  // カード
  { source: 'ザ・クラス', target: '負債/カード/JCB' },
  { source: 'MARRIOTT BONVOY アメリカン・エキスプレス', target: '負債/カード/Amex' },
  { source: '三井住友プラチナVISA', target: '負債/カード/三井住友' },
  { source: 'hama-eco カード', target: '負債/カード/ハマエコ' },
  { source: 'ソラシドエア', target: '負債/カード/ソラシド' },
  { source: 'Amazon旧クラシック', target: '負債/カード/AMAZON' },
  { source: '楽天明子プレミアムカード (Visa)', target: '負債/カード/楽天（明子）' },

  // 楽天亮太は2枚あるが、シートは1行なので合算する
  { source: '楽天亮太カード (Visa)', target: '負債/カード/楽天（亮太）' },
  { source: '楽天亮太プレミアムカード (Mastercard)', target: '負債/カード/楽天（亮太）' },

  // ローン
  { source: 'カードローン', target: '負債/ローン/みずほ' },
];

/**
 * 負債側は Moneytree がマイナスで返すため絶対値に直して書く。
 * 大分類が「負債」の行をすべて対象にする。
 */
function isLiability_(targetKey) {
  return targetKey.indexOf('負債/') === 0;
}

/**
 * 取込シートの内容をシート7の最新列に書き込む。
 */
function importBalances() {
  const ss = SpreadsheetApp.openById(IMPORT_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(IMPORT_CONFIG.sheetName);
  const importSheet = ss.getSheetByName(IMPORT_CONFIG.importSheetName);
  if (!sheet) throw new Error('シートが見つかりません: ' + IMPORT_CONFIG.sheetName);
  if (!importSheet) throw new Error('取込シートがありません。createImportSheet() を実行してください。');

  const entries = readImportSheet_(importSheet);
  if (entries.length === 0) throw new Error('取込シートにデータがありません。');

  const layout = detectLayout_(sheet);
  const rowIndex = buildRowIndex_(sheet);

  // マッピングを引いて target ごとに合算する。
  const sums = {};
  const unmapped = [];
  const lookup = {};
  MAPPING.forEach(function (m) { lookup[m.source.trim()] = m.target; });

  entries.forEach(function (e) {
    const target = lookup[e.name];
    if (!target) {
      unmapped.push(e.name);
      return;
    }
    const value = isLiability_(target) ? Math.abs(e.amount) : e.amount;
    sums[target] = (sums[target] || 0) + value;
  });

  // 書き込み先は最新の日付列。
  const col = layout.lastDataCol;
  const written = [];
  const missingRows = [];

  Object.keys(sums).forEach(function (target) {
    const row = rowIndex[target];
    if (!row) {
      missingRows.push(target);
      return;
    }
    sheet.getRange(row, col).setValue(sums[target]);
    written.push({ target: target, row: row, value: sums[target] });
  });

  const date = sheet.getRange(layout.dateRow, col).getDisplayValue();
  const report = {
    書き込み先の列: columnLetter_(col),
    列の日付: date,
    書き込んだ件数: written.length,
    内訳: written,
    マッピングに無い口座名: unmapped,
    シートに見つからない行: missingRows,
  };
  console.log(JSON.stringify(report, null, 2));

  if (unmapped.length > 0 || missingRows.length > 0) {
    console.log('※ 未処理の項目があります。MAPPING を確認してください。');
  }
  return report;
}

/**
 * 書き込まずに、何がどの行に入るかだけ確認する。
 */
function importDryRun() {
  const ss = SpreadsheetApp.openById(IMPORT_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(IMPORT_CONFIG.sheetName);
  const importSheet = ss.getSheetByName(IMPORT_CONFIG.importSheetName);
  const entries = importSheet ? readImportSheet_(importSheet) : [];
  const layout = detectLayout_(sheet);
  const rowIndex = buildRowIndex_(sheet);

  const lookup = {};
  MAPPING.forEach(function (m) { lookup[m.source.trim()] = m.target; });

  const plan = entries.map(function (e) {
    const target = lookup[e.name];
    return {
      入力: e.name,
      金額: e.amount,
      対応先: target || '（マッピング無し）',
      行: target ? (rowIndex[target] || '（行が見つからない）') : '-',
    };
  });

  console.log(JSON.stringify({
    書き込み先の列: columnLetter_(layout.lastDataCol),
    列の日付: sheet.getRange(layout.dateRow, layout.lastDataCol).getDisplayValue(),
    予定: plan,
  }, null, 2));
}

/**
 * シート7の全行を「大分類/中分類/項目」で引けるようにする。
 * 大分類・中分類は縦方向に結合されている想定で、上の値を引き継ぐ。
 */
function buildRowIndex_(sheet) {
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(1, IMPORT_CONFIG.majorCol, lastRow,
    IMPORT_CONFIG.itemCol - IMPORT_CONFIG.majorCol + 1).getDisplayValues();

  const index = {};
  let major = '';
  let minor = '';
  for (let i = 0; i < values.length; i++) {
    const m = String(values[i][0]).trim();
    const n = String(values[i][1]).trim();
    const item = String(values[i][2]).trim();
    if (m !== '') major = m;
    if (n !== '') minor = n;
    if (item === '') continue;
    const key = major + '/' + minor + '/' + item;
    // 同じキーが複数あっても最初の行を採用する。
    if (!index[key]) index[key] = i + 1;
  }
  return index;
}

/**
 * 解決した行の一覧を出す。マッピングの target を書くときの参照用。
 */
function listRowKeys() {
  const sheet = SpreadsheetApp.openById(IMPORT_CONFIG.spreadsheetId)
    .getSheetByName(IMPORT_CONFIG.sheetName);
  const index = buildRowIndex_(sheet);
  const lines = Object.keys(index).map(function (k) { return index[k] + '\t' + k; });
  console.log(lines.join('\n'));
}

/**
 * 取込シートを読む。A列に口座名、B列に金額。1行目は見出し。
 */
function readImportSheet_(importSheet) {
  const lastRow = importSheet.getLastRow();
  if (lastRow < 2) return [];
  const values = importSheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const entries = [];
  values.forEach(function (row) {
    const name = String(row[0]).trim();
    if (name === '') return;
    const amount = parseAmount_(row[1]);
    if (amount === null) return;
    entries.push({ name: name, amount: amount });
  });
  return entries;
}

/**
 * 「-¥351,275」のような表記も数値に直す。
 */
function parseAmount_(raw) {
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (s === '') return null;
  const cleaned = s.replace(/[¥,\s]/g, '').replace(/[−–—]/g, '-');
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * 取込シートを作る。初回に1度だけ実行する。
 */
function createImportSheet() {
  const ss = SpreadsheetApp.openById(IMPORT_CONFIG.spreadsheetId);
  let sheet = ss.getSheetByName(IMPORT_CONFIG.importSheetName);
  if (sheet) {
    console.log('取込シートは既にあります。');
    return;
  }
  sheet = ss.insertSheet(IMPORT_CONFIG.importSheetName);
  sheet.getRange(1, 1, 1, 2).setValues([['口座名', '金額']]);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  sheet.setColumnWidth(1, 320);
  sheet.setColumnWidth(2, 140);
  console.log('取込シートを作りました。');
}
