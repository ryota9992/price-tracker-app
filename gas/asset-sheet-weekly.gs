/**
 * 資産管理シート「お金関連」シート7 の週次更新スクリプト。
 *
 * 毎週トリガーで実行され、最新の記録列の右に新しい日付列を追加する。
 * 追加した列には前回列の内容をコピーするため、
 *   - 数式（小計・合計行）は相対参照が調整されて引き継がれる
 *   - 値（各口座の残高）は前回値が入った状態になる
 * 変動した口座だけ上書きすればよく、未入力の口座が空欄になって
 * 小計が実態とズレる問題も起きない。
 *
 * 導入手順は gas/README.md を参照。
 */

const CONFIG = {
  spreadsheetId: '1XauPN5Kl-Mw2j8OMxJkATCmDsGDyqybLZFHAjhqW0_0',
  sheetName: 'シート7',

  // 日付行の書式。既存シートに合わせて M/d（例: 8/5）。
  dateFormat: 'M/d',

  // 年行の入力方針。
  //   'onChange' … 年が変わったときだけ入れる（既存シートの見た目に合わせる）
  //   'always'   … 毎回入れる
  yearPolicy: 'onChange',

  // 列追加後に通知メールを送る場合は宛先を設定する。空文字なら送らない。
  notifyEmail: '',
};

/**
 * 週次トリガーから呼ばれるエントリポイント。
 */
function addWeeklyColumn() {
  const sheet = SpreadsheetApp.openById(CONFIG.spreadsheetId)
    .getSheetByName(CONFIG.sheetName);
  if (!sheet) {
    throw new Error('シートが見つかりません: ' + CONFIG.sheetName);
  }

  const layout = detectLayout_(sheet);
  const today = new Date();

  // 前回列を右に1列コピーする。数式・書式ごと複製されるので、
  // 小計行や合計行はそのまま新しい列を集計するようになる。
  sheet.insertColumnAfter(layout.lastDataCol);
  const newCol = layout.lastDataCol + 1;
  const rows = sheet.getMaxRows();
  sheet.getRange(1, layout.lastDataCol, rows, 1)
    .copyTo(sheet.getRange(1, newCol, rows, 1));

  // 年行と日付行だけは前回値のコピーではなく今日の日付で上書きする。
  writeDateHeader_(sheet, layout, newCol, today);

  const label = Utilities.formatDate(
    today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  console.log('列を追加しました: ' + columnLetter_(newCol) + ' (' + label + ')');

  if (CONFIG.notifyEmail) {
    notify_(label);
  }
}

/**
 * シートの構造を実際の中身から検出する。
 * 行や列の位置をハードコードすると、シートを編集したときに壊れるため。
 */
function detectLayout_(sheet) {
  const scanRows = Math.min(12, sheet.getMaxRows());
  const scanCols = Math.min(200, sheet.getMaxColumns());
  const values = sheet.getRange(1, 1, scanRows, scanCols).getDisplayValues();

  // 日付行 = m/d 形式のセルが5個以上並ぶ行。
  let dateRow = -1;
  for (let r = 0; r < scanRows; r++) {
    let hits = 0;
    for (let c = 0; c < scanCols; c++) {
      if (/^\d{1,2}\/\d{1,2}$/.test(values[r][c].trim())) hits++;
    }
    if (hits >= 5) {
      dateRow = r + 1;
      break;
    }
  }
  if (dateRow === -1) {
    throw new Error('日付行を検出できませんでした。CONFIG.dateFormat と実際の書式を確認してください。');
  }

  // 年行 = 日付行より上で、4桁の年が2個以上並ぶ行。
  let yearRow = -1;
  for (let r = dateRow - 2; r >= 0; r--) {
    let hits = 0;
    for (let c = 0; c < scanCols; c++) {
      if (/^(19|20)\d{2}$/.test(values[r][c].trim())) hits++;
    }
    if (hits >= 2) {
      yearRow = r + 1;
      break;
    }
  }

  // データ列の範囲は日付行の埋まっている範囲から求める。
  const dates = values[dateRow - 1];
  let firstDataCol = -1;
  let lastDataCol = -1;
  for (let c = 0; c < scanCols; c++) {
    if (dates[c].trim() !== '') {
      if (firstDataCol === -1) firstDataCol = c + 1;
      lastDataCol = c + 1;
    }
  }
  if (lastDataCol === -1) {
    throw new Error('データ列を検出できませんでした。');
  }

  return { dateRow: dateRow, yearRow: yearRow, firstDataCol: firstDataCol, lastDataCol: lastDataCol };
}

/**
 * 新しい列の年行・日付行を書く。
 */
function writeDateHeader_(sheet, layout, col, date) {
  const tz = Session.getScriptTimeZone();
  sheet.getRange(layout.dateRow, col)
    .setValue(Utilities.formatDate(date, tz, CONFIG.dateFormat));

  if (layout.yearRow === -1) return;

  const year = String(date.getFullYear());
  if (CONFIG.yearPolicy === 'always') {
    sheet.getRange(layout.yearRow, col).setValue(year);
    return;
  }

  // onChange: 直近に書かれている年と違うときだけ入れる。
  const prior = sheet.getRange(layout.yearRow, layout.firstDataCol,
    1, col - layout.firstDataCol).getDisplayValues()[0];
  let lastYear = '';
  for (let i = prior.length - 1; i >= 0; i--) {
    if (prior[i].trim() !== '') {
      lastYear = prior[i].trim();
      break;
    }
  }
  sheet.getRange(layout.yearRow, col).setValue(lastYear === year ? '' : year);
}

function notify_(label) {
  const url = 'https://docs.google.com/spreadsheets/d/' + CONFIG.spreadsheetId + '/edit';
  MailApp.sendEmail({
    to: CONFIG.notifyEmail,
    subject: '[お金関連] ' + label + ' の列を追加しました',
    body: '前回の残高をコピーした状態で新しい列を作りました。\n'
      + '変動した口座だけ上書きしてください。\n\n' + url + '\n',
  });
}

function columnLetter_(col) {
  let s = '';
  while (col > 0) {
    const m = (col - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    col = (col - m - 1) / 26;
  }
  return s;
}

/**
 * 週次トリガーを登録する。手動で1回だけ実行する。
 * 既存の同名トリガーは張り替える。
 */
function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'addWeeklyColumn'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('addWeeklyColumn')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  console.log('毎週月曜 8時台のトリガーを登録しました。');
}

/**
 * 書き込まずに検出結果だけ確認する。導入時の動作確認用。
 */
function dryRun() {
  const sheet = SpreadsheetApp.openById(CONFIG.spreadsheetId)
    .getSheetByName(CONFIG.sheetName);
  const layout = detectLayout_(sheet);
  console.log(JSON.stringify({
    年行: layout.yearRow,
    日付行: layout.dateRow,
    最初のデータ列: columnLetter_(layout.firstDataCol),
    最後のデータ列: columnLetter_(layout.lastDataCol),
    最後の日付: sheet.getRange(layout.dateRow, layout.lastDataCol).getDisplayValue(),
    次に追加される列: columnLetter_(layout.lastDataCol + 1),
  }, null, 2));
}
