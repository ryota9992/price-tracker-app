#!/bin/bash
# Mac用。このファイルをダブルクリックすると起動します。
# 初回だけ必要な準備を自動でやってから、操作画面をブラウザで開きます。

cd "$(dirname "$0")" || exit 1

echo "======================================"
echo " Yahoo!フリマ 自動再出品"
echo "======================================"
echo ""

# --- Node.js が入っているか ---
if ! command -v node > /dev/null 2>&1; then
  echo "⚠️  Node.js が入っていません。"
  echo ""
  echo "   https://nodejs.org を開いて「LTS」と書かれたほうをダウンロードし、"
  echo "   インストールしてから、もう一度このファイルをダブルクリックしてください。"
  echo ""
  open "https://nodejs.org" 2>/dev/null
  echo "Enterキーを押すと閉じます。"
  read -r
  exit 1
fi

# --- 初回の準備 ---
if [ ! -d node_modules ]; then
  echo "初回の準備をします。数分かかります。そのままお待ちください…"
  echo ""
  npm install || { echo ""; echo "⚠️ 準備に失敗しました。この画面ごとスクリーンショットを撮って相談してください。"; read -r; exit 1; }
  echo ""
  echo "自動操作用のブラウザを取得します。もう数分かかります…"
  npx playwright install chromium || { echo ""; echo "⚠️ ブラウザの取得に失敗しました。"; read -r; exit 1; }
  echo ""
  echo "準備ができました。"
  echo ""
fi

# --- 設定ファイル ---
if [ ! -f config.json ]; then
  cp config.example.json config.json
fi

PORT=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('config.json','utf8')).uiPort||8787)}catch(e){console.log(8787)}")

echo "操作画面をブラウザで開きます → http://localhost:$PORT"
echo ""
echo "※ この黒い画面は閉じないでください。閉じると止まります。"
echo "※ 終わるときは、この画面で control + C を押してください。"
echo ""

# サーバーが立ち上がってからブラウザを開く
( sleep 2; open "http://localhost:$PORT" ) &

node src/cli.js app

echo ""
echo "停止しました。Enterキーを押すと閉じます。"
read -r
