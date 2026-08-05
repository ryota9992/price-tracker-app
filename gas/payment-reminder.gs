/**
 * 引き落としリスク管理のリマインダー。
 *
 * シート7は合計基準（未確定＋確定＋リボ）で残高の実態を追う。
 * そこからは「次回いくら払うか」が取り出せないため、確定額の確認は
 * 締め日を過ぎたタイミングで別途行う。
 *
 * 確定額は締め日を過ぎたら支払日まで動かないので、週次で見る必要はない。
 * 支払日で2群に分かれるため、月2回の確認で足りる。
 *
 * 締め日は暫定値。正確な日付が分かったら CARD_GROUPS を差し替える。
 */

const REMINDER_CONFIG = {
  spreadsheetId: '1XauPN5Kl-Mw2j8OMxJkATCmDsGDyqybLZFHAjhqW0_0',

  // 通知先。空だとメールを送らない。
  notifyEmail: '',
};

const CARD_GROUPS = [
  {
    name: '10日払い群',
    // 締め日の翌日あたりに通知する（暫定: 15日締め）
    reminderDay: 16,
    payday: '10日',
    cards: [
      'Amex（MARRIOTT BONVOY アメリカン・エキスプレス）',
      'JCB（ザ・クラス）',
      '三井住友（三井住友プラチナVISA）',
      'ハマエコ（hama-eco カード）',
      'ソラシド（ソラシドエア）',
      'BICカメラSuica（支払は5日）',
    ],
  },
  {
    name: '26日払い群',
    // 暫定: 月末締め
    reminderDay: 1,
    payday: '26日 / 27日',
    cards: [
      'AMAZON（Amazon旧クラシック）',
      '楽天（亮太）Visa + Mastercard の2枚',
      '楽天（明子）プレミアムカード',
      'JOSHIN',
      'Tカードプラス',
    ],
  },
];

/**
 * 月次トリガーから呼ばれる。今日が通知日の群だけ送る。
 */
function sendPaymentReminder() {
  const today = new Date();
  const day = today.getDate();
  const groups = CARD_GROUPS.filter(function (g) { return g.reminderDay === day; });
  if (groups.length === 0) {
    console.log('本日（' + day + '日）に該当する群はありません。');
    return;
  }
  groups.forEach(function (g) { notifyGroup_(g); });
}

function notifyGroup_(group) {
  const url = 'https://docs.google.com/spreadsheets/d/' + REMINDER_CONFIG.spreadsheetId + '/edit';
  const body = [
    group.name + 'の請求が確定している頃です。',
    '',
    '各カードを Moneytree で開き、「確定」の金額を確認してください。',
    '合計額が支払日（' + group.payday + '）までに口座にあるか見てください。',
    '',
    '対象カード:',
  ].concat(group.cards.map(function (c) { return '  - ' + c; }))
    .concat([
      '',
      '※ シート7は合計基準（未確定込み）なので、この確認の代わりにはなりません。',
      '',
      url,
      '',
    ]).join('\n');

  console.log(body);

  if (REMINDER_CONFIG.notifyEmail) {
    MailApp.sendEmail({
      to: REMINDER_CONFIG.notifyEmail,
      subject: '[お金関連] ' + group.name + ' の確定額を確認してください',
      body: body,
    });
  }
}

/**
 * 月次トリガーを登録する。手動で1度だけ実行する。
 * CARD_GROUPS の reminderDay ごとにトリガーを張る。
 */
function installReminderTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'sendPaymentReminder'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  const days = {};
  CARD_GROUPS.forEach(function (g) { days[g.reminderDay] = true; });

  Object.keys(days).forEach(function (d) {
    ScriptApp.newTrigger('sendPaymentReminder')
      .timeBased()
      .onMonthDay(Number(d))
      .atHour(8)
      .create();
    console.log('毎月' + d + '日 8時台のトリガーを登録しました。');
  });
}
