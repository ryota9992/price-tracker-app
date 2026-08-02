@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ======================================
echo  Yahoo!フリマ 自動再出品
echo ======================================
echo.

where node > nul 2>&1
if errorlevel 1 (
  echo [!] Node.js が入っていません。
  echo.
  echo     https://nodejs.org を開いて「LTS」と書かれたほうをダウンロードし、
  echo     インストールしてから、もう一度このファイルをダブルクリックしてください。
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo 初回の準備をします。数分かかります。そのままお待ちください...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [!] 準備に失敗しました。この画面ごとスクリーンショットを撮って相談してください。
    pause
    exit /b 1
  )
  echo.
  echo 自動操作用のブラウザを取得します。もう数分かかります...
  call npx playwright install chromium
  if errorlevel 1 (
    echo.
    echo [!] ブラウザの取得に失敗しました。
    pause
    exit /b 1
  )
  echo.
  echo 準備ができました。
  echo.
)

if not exist config.json copy config.example.json config.json > nul

rem config.json の uiPort を変えた場合は、下の 8787 も合わせて直してください
set PORT=8787

echo 操作画面をブラウザで開きます -^> http://localhost:%PORT%
echo.
echo ※ この黒い画面は閉じないでください。閉じると止まります。
echo ※ 終わるときは、この画面で Ctrl + C を押してください。
echo.

start "" cmd /c "timeout /t 3 > nul && start http://localhost:%PORT%"

node src/cli.js app

echo.
echo 停止しました。
pause
