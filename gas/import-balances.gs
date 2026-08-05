/**
 * Moneytree の口座残高を「取込」シート経由でシート7に転記する。
 *
 * 運用（スマホで完結する）:
 *   1. 週次トリガー（asset-sheet-weekly.gs）が新しい日付列を追加する
 *   2. Moneytree の口座残高画面のスクショから起こした「口座名 / 金額」を
 *      取込シートに貼る
 *   3. 貼った時点で onEdit トリガーが発火し、自動で転記される
 *   4. 結果は取込シートの1行目に表示される
 *
 * スマホでは Apps Script のエディタも実行ログも使えないため、
 * 手動実行を前提にせず、結果はシート上に書き戻す。
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

  // 取込シートの構成
  statusRow: 1,   // スクリプトが結果を書く行
  headerRow: 2,   // 見出し
  firstDataRow: 3,

  // 大分類・中分類の列（B列・C列）と項目の列（D列）。
  // 縦方向に結合されている場合は上から値を引き継いで解決する。
  majorCol: 2,
  minorCol: 3,
  itemCol: 4,

  // 転記したセルの文字色。前回値の引き継ぎ・手入力と見分けるため。
  // 空文字にすると色を変えない。
  importedFontColor: '#d93025',
};

/**
 * Moneytree の表示名 → シート7の行（大分類/中分類/項目）。
 *
 * source は Moneytree の口座残高画面に出る名前。前後の空白は無視して
 * 完全一致で引く。表記が変わったらここだけ直せばよい。
 *
 * 同じ target を複数の source が指す場合は合算される。
 */
const MAPPING = [
  // 銀行
  // 三菱UFJ は Moneytree 側に名義が出ないが、金額（2,288,535）が
  // シートの 三菱UFJ（亮太）7/18 時点 2,190,602 とほぼ一致し、
  // 明子名義（930,471）とは桁が違うため亮太で確定。
  { source: 'みずほ銀行 普通', target: '資産/銀行/みずほ（亮太）' },
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

  // フリマ。Moneytree では取得できないため、各アプリの画面から起こす。
  // 拾う項目はアプリごとに違う。ポイント・キャッシュ・ビットコインは含めない。
  //   Yahoo!フリマ・ラクマ … 売上金
  //   メルカリ            … 残高（売上金は残高に統合されている）
  { source: 'Yahooフリマ売上金（亮太）', target: '資産/フリマ/Payフリ（亮太）' },
  { source: 'Yahooフリマ売上金（明子）', target: '資産/フリマ/Payフリ（明子）' },
  { source: 'ラクマ売上金', target: '資産/フリマ/ラクマ' },
  { source: 'メルカリ残高', target: '資産/フリマ/メルカリ' },

  // ------------------------------------------------------------------
  // 以下は自動取得できない行。チャットで伝えた値を貼り付けテキストに
  // 含めるためのマッピング。取込シートに現れなければ書き込まれないので、
  // 毎回すべてを埋める必要はない（前回値がそのまま残る）。
  // ------------------------------------------------------------------

  // 未連携の銀行。名前が負債側のカードと衝突しないよう「銀行」を付ける。
  { source: '三菱UFJ銀行（明子）', target: '資産/銀行/三菱UFJ（明子）' },
  { source: '楽天銀行（亮太）', target: '資産/銀行/楽天（亮太）' },
  { source: '楽天銀行（明子）', target: '資産/銀行/楽天（明子）' },
  { source: '横浜銀行（明子）', target: '資産/銀行/横浜銀行（明子）' },
  { source: 'タンス', target: '資産/銀行/タンス' },

  // 未連携のカード・ローン
  { source: 'BICカメラSuica', target: '負債/カード/BICカメラSuica' },
  { source: 'ニッセンマジカル', target: '負債/カード/ニッセンマジカル' },
  { source: '三菱UFJカード', target: '負債/カード/三菱UFJ' },
  { source: 'JOSHIN', target: '負債/カード/JOSHIN' },
  { source: 'Tカードプラス', target: '負債/カード/Tカードプラス' },
  { source: 'ローン父', target: '負債/ローン/父' },
  { source: 'ローン車', target: '負債/ローン/車' },

  // 買取屋。金融機関ではないため取得手段が無く、常に手入力。
  { source: '買取屋 森森', target: '資産/買取屋/森森' },
  { source: '買取屋 海峡', target: '資産/買取屋/海峡' },
  { source: '買取屋 商店', target: '資産/買取屋/商店' },
  { source: '買取屋 ルデヤ', target: '資産/買取屋/ルデヤ' },
  { source: '買取屋 一丁目', target: '資産/買取屋/一丁目' },
  { source: '買取屋 家電市場', target: '資産/買取屋/家電市場' },
  { source: '買取屋 wiki', target: '資産/買取屋/wiki' },
  { source: '買取屋 モバイルミックス', target: '資産/買取屋/モバイルミックス' },

  // 証券（楽天証券）。追加認証のため Moneytree と連携できない。
  // シート上の中分類は「在庫」からの結合で続いている。
  { source: '証券（亮太）', target: '資産/在庫/亮太' },
  { source: '証券（明子）', target: '資産/在庫/明子' },
  { source: '証券（結楓）', target: '資産/在庫/結楓' },
  { source: '証券（結依）', target: '資産/在庫/結依' },

  // その他
  { source: 'アップルギフトカード', target: '資産/金券/アップルギフトカード' },
  { source: '在庫商品', target: '資産/在庫/商品' },
  { source: 'ポイ投 iPhoneSE12 PayPay', target: '資産/ポイ投/iPhoneSE12 PayPay' },
  { source: 'ポイ投 iPhoneSE11 PayPay', target: '資産/ポイ投/iPhoneSE11 PayPay' },
  { source: 'ポイ投 楽天ポイント', target: '資産/ポイ投/楽天ポイント' },
  { source: 'LINEPay', target: '資産/その他/LINEPay' },
  { source: 'ポイントサイト', target: '資産/その他/ポイントサイト' },
];

/** 大分類が「負債」の行は絶対値で書く。 */
function isLiability_(targetKey) {
  return targetKey.indexOf('負債/') === 0;
}

/**
 * 取込シートが編集されたら自動で転記する。
 * インストール型 onEdit トリガーから呼ばれる（installImportTrigger で登録）。
 * スクリプト自身の書き込みでは発火しないので、ステータス更新でループしない。
 */
function onImportEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== IMPORT_CONFIG.importSheetName) return;
  // ステータス行の編集は無視する。
  if (e.range.getLastRow() < IMPORT_CONFIG.firstDataRow) return;
  importBalances();
}

/**
 * 取込シートの内容をシート7の最新列に書き込む。
 * 結果は取込シートの1行目に表示する。
 */
function importBalances() {
  const ss = SpreadsheetApp.openById(IMPORT_CONFIG.spreadsheetId);
  const importSheet = ss.getSheetByName(IMPORT_CONFIG.importSheetName);
  if (!importSheet) throw new Error('取込シートがありません。createImportSheet() を実行してください。');

  try {
    const result = runImport_(ss, importSheet);
    setStatus_(importSheet, result.message, result.ok);
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    setStatus_(importSheet, '✗ エラー: ' + err.message, false);
    throw err;
  }
}

function runImport_(ss, importSheet) {
  const sheet = ss.getSheetByName(IMPORT_CONFIG.sheetName);
  if (!sheet) throw new Error('シートが見つかりません: ' + IMPORT_CONFIG.sheetName);

  const entries = parseImportSheet_(importSheet);
  if (entries.length === 0) {
    return { ok: false, message: '取込シートにデータがありません。', written: [] };
  }

  const layout = detectLayout_(sheet);
  const rowIndex = buildRowIndex_(sheet);

  const lookup = {};
  MAPPING.forEach(function (m) { lookup[m.source.trim()] = m.target; });

  const sums = {};
  const unmapped = [];
  entries.forEach(function (e) {
    const target = lookup[e.name];
    if (!target) {
      unmapped.push(e.name);
      return;
    }
    const value = isLiability_(target) ? Math.abs(e.amount) : e.amount;
    sums[target] = (sums[target] || 0) + value;
  });

  const col = layout.lastDataCol;
  const written = [];
  const missingRows = [];
  Object.keys(sums).forEach(function (target) {
    const row = rowIndex[target];
    if (!row) {
      missingRows.push(target);
      return;
    }
    const cell = sheet.getRange(row, col);
    cell.setValue(sums[target]);
    if (IMPORT_CONFIG.importedFontColor) {
      cell.setFontColor(IMPORT_CONFIG.importedFontColor);
    }
    written.push({ target: target, row: row, value: sums[target] });
  });

  const date = sheet.getRange(layout.dateRow, col).getDisplayValue();
  const parts = ['✓ ' + date + ' の列（' + columnLetter_(col) + '）に '
    + written.length + ' 件を転記しました。'];
  if (unmapped.length > 0) {
    parts.push('未対応の口座名: ' + unmapped.join(' / '));
  }
  if (missingRows.length > 0) {
    parts.push('シートに行が無い: ' + missingRows.join(' / '));
  }

  return {
    ok: unmapped.length === 0 && missingRows.length === 0,
    message: parts.join('　'),
    列: columnLetter_(col),
    日付: date,
    written: written,
    unmapped: unmapped,
    missingRows: missingRows,
  };
}

function setStatus_(importSheet, message, ok) {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd HH:mm');
  const cell = importSheet.getRange(IMPORT_CONFIG.statusRow, 1);
  cell.setValue('[' + stamp + '] ' + message);
  cell.setFontColor(ok ? '#137333' : '#b31412');
}

/**
 * 取込シートを読む。貼り方の揺れを吸収する。
 *
 * スマホの Google スプレッドシートは、複数行のテキストを貼ると
 * 1セルにまとめて入ることがある。以下のいずれでも読めるようにする。
 *   - A列に口座名、B列に金額（タブ区切りで貼った場合）
 *   - A列の1セルに「名前\t金額」が改行区切りで全部入っている場合
 *   - A列に「名前 金額」が1行ずつ入っている場合
 */
function parseImportSheet_(importSheet) {
  const lastRow = importSheet.getLastRow();
  if (lastRow < IMPORT_CONFIG.firstDataRow) return [];
  const n = lastRow - IMPORT_CONFIG.firstDataRow + 1;
  const values = importSheet.getRange(IMPORT_CONFIG.firstDataRow, 1, n, 2).getValues();

  const entries = [];
  values.forEach(function (row) {
    const a = String(row[0]).trim();
    if (a === '') return;

    // B列に金額があるなら素直に読む。
    const b = parseAmount_(row[1]);
    if (b !== null && a.indexOf('\n') === -1 && a.indexOf('\t') === -1) {
      entries.push({ name: a, amount: b });
      return;
    }

    // 1セルに複数行入っている場合は行ごとに分解する。
    a.split(/\r?\n/).forEach(function (line) {
      const parsed = parseLine_(line);
      if (parsed) entries.push(parsed);
    });
  });
  return entries;
}

/**
 * 「名前<TAB>金額」または「名前 -¥351,275」のような1行を分解する。
 */
function parseLine_(line) {
  const s = String(line).trim();
  if (s === '') return null;

  // タブ区切りを優先する。
  if (s.indexOf('\t') !== -1) {
    const parts = s.split('\t');
    const amount = parseAmount_(parts[parts.length - 1]);
    if (amount === null) return null;
    return { name: parts.slice(0, -1).join('\t').trim(), amount: amount };
  }

  // 末尾の金額らしき部分を切り出す。
  const m = s.match(/^(.*?)[\s]+([-−–—]?[¥￥]?[\d,]+)$/);
  if (!m) return null;
  const amount = parseAmount_(m[2]);
  if (amount === null) return null;
  return { name: m[1].trim(), amount: amount };
}

/** 「-¥351,275」のような表記も数値に直す。 */
function parseAmount_(raw) {
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (s === '') return null;
  const cleaned = s.replace(/[¥￥,\s]/g, '').replace(/[−–—]/g, '-');
  if (!/^-?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * シート7の全行を「大分類/中分類/項目」で引けるようにする。
 * 大分類・中分類は縦方向に結合されている想定で、上の値を引き継ぐ。
 */
function buildRowIndex_(sheet) {
  const lastRow = sheet.getLastRow();
  const width = IMPORT_CONFIG.itemCol - IMPORT_CONFIG.majorCol + 1;
  const values = sheet.getRange(1, IMPORT_CONFIG.majorCol, lastRow, width).getDisplayValues();

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
    if (!index[key]) index[key] = i + 1;
  }
  return index;
}

/**
 * 解決した行の一覧を取込シートのD列に書き出す。
 * MAPPING の target を直すときの参照用。スマホでも見られるようにシートに出す。
 */
function listRowKeys() {
  const ss = SpreadsheetApp.openById(IMPORT_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(IMPORT_CONFIG.sheetName);
  const importSheet = ss.getSheetByName(IMPORT_CONFIG.importSheetName);
  const index = buildRowIndex_(sheet);
  const rows = Object.keys(index).map(function (k) { return [index[k], k]; });
  rows.sort(function (x, y) { return x[0] - y[0]; });

  console.log(rows.map(function (r) { return r[0] + '\t' + r[1]; }).join('\n'));

  if (importSheet) {
    importSheet.getRange(1, 4, Math.max(importSheet.getMaxRows(), 1), 2).clearContent();
    importSheet.getRange(1, 4, 1, 2).setValues([['行', 'キー']]).setFontWeight('bold');
    if (rows.length > 0) {
      importSheet.getRange(2, 4, rows.length, 2).setValues(rows);
    }
    importSheet.setColumnWidth(5, 320);
  }
}

/**
 * 取込シートを作る。初回に1度だけ実行する。
 */
function createImportSheet() {
  const ss = SpreadsheetApp.openById(IMPORT_CONFIG.spreadsheetId);
  let sheet = ss.getSheetByName(IMPORT_CONFIG.importSheetName);
  if (!sheet) {
    sheet = ss.insertSheet(IMPORT_CONFIG.importSheetName);
  }
  sheet.getRange(IMPORT_CONFIG.headerRow, 1, 1, 2)
    .setValues([['口座名', '金額']]).setFontWeight('bold');
  sheet.getRange(IMPORT_CONFIG.statusRow, 1)
    .setValue('ここに結果が表示されます');
  sheet.setColumnWidth(1, 320);
  sheet.setColumnWidth(2, 140);
  console.log('取込シートを用意しました。');
}

/**
 * 取込シートへの貼り付けで自動転記が走るようにする。
 * スマホから運用するために必要。手動で1度だけ実行する。
 */
function installImportTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'onImportEdit'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('onImportEdit')
    .forSpreadsheet(IMPORT_CONFIG.spreadsheetId)
    .onEdit()
    .create();

  console.log('取込シートの編集で自動転記が走るようになりました。');
}
