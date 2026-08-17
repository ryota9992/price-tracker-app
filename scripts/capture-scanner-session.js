/**
 * 買取スキャナー（Googleログイン）のセッションを手動ログインで取得し、
 * Vercelの環境変数 KAITORI_SCANNER_STORAGE_STATE に貼り付けるJSONを出力するスクリプト。
 *
 * Googleログインは自動化しない（Google側のbot検知・アカウント保護に引っかかるため）。
 * 実際のブラウザを開いて、あなた自身の手でいつも通りログインしてもらい、
 * その結果（Cookie・localStorage・IndexedDB）だけを保存する。
 *
 * 使い方:
 *   npm run capture-scanner-session
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const LOGIN_URL = 'https://hikaku-342505.firebaseapp.com/auth/login';
const OUTPUT_FILE = path.join(__dirname, '..', 'scanner-session.json');

function waitForEnter(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  console.log('ブラウザを起動します（画面が表示されます）...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOGIN_URL);

  console.log('');
  console.log('==============================================');
  console.log('開いたブラウザ画面で、いつも通りGoogleアカウントでログインしてください。');
  console.log('「商品検索」画面が表示されたら、ここに戻ってこのターミナルで Enter キーを押してください。');
  console.log('==============================================');
  console.log('');

  await waitForEnter('ログインが完了したら Enter を押してください... ');

  const state = await context.storageState({ path: OUTPUT_FILE, indexedDB: true });

  console.log('');
  console.log(`保存しました: ${OUTPUT_FILE}`);
  console.log('');
  console.log('次の手順:');
  console.log('1. 上のファイルの中身をすべてコピーする');
  console.log('   （またはこのターミナルにこの後表示される1行のJSONをそのままコピーしてもOK）');
  console.log('2. Vercelの Environment Variables で');
  console.log('   Key: KAITORI_SCANNER_STORAGE_STATE');
  console.log('   Value: コピーした中身');
  console.log('   として保存する');
  console.log('3. Vercelで Redeploy する');
  console.log('');
  console.log('--- コピー用（1行）---');
  console.log(JSON.stringify(state));
  console.log('--- ここまで ---');

  await browser.close();
}

main().catch((error) => {
  console.error('失敗しました:', error);
  process.exit(1);
});
