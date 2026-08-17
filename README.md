# 買取利益チェッカー

通販サイトの商品ページを見ているときに、「これを買って買取に出したら儲かるか」をその場で判定するWebアプリです。

- **買取利益チェック（`/check`）** — 商品ページのスクリーンショット、またはURLから「購入価格」「ポイント還元」「買取価格」を集め、差引利益を緑（買い時）／赤（損）で即座に表示します
- **スクリーンショット比較表（`/`）** — 複数の買取価格スクショから価格を抽出し、比較表とCSVを作る従来機能

## 📲 iPhoneでの使い方

デプロイ後に `/setup` を開くと手順とコピーボタンが表示されます。

- **スクリーンショット方式（おすすめ・正確）**: 商品ページの価格・ポイント表示をスクショ → アプリをホーム画面に追加しておいてタップ → 画像を選ぶだけ。通販サイトの多くはJavaScriptで動的に価格を描画するため、画像認識の方がURL取得より正確です
- **URL共有方式**: 共有シート（ショートカットApp）またはブックマークレットでページURLを渡す方法。手早いが、サイトによっては価格・ポイントを正しく読み取れないことがある

## 🔎 判定のしくみ

1. 画像またはURLから「商品名」「購入価格」「ポイント還元額」をClaude（`claude-opus-5`、画像認識 + web_fetch）が読み取る
2. **買取価格は「買取スキャナー」（`hikaku-342505.firebaseapp.com`）にログインし、実際の商品検索結果から取得する。**
   買取スキャナーで見つからなかった場合のみ、Web検索（Claude + web_search）にフォールバックする
3. `差引利益 = 買取価格 − (購入価格 − ポイント還元額)` をアプリ側で計算し、プラスなら🟢買い時、マイナスなら🔴損と即座に表示
4. 読み取った購入価格・ポイントは画面上で手直しでき、編集すると通信なしでその場再計算される

### ⚠️ 買取スキャナー連携について

- 買取スキャナーには**Googleアカウントでのログインしか無い**。GoogleはBot・自動化ツールによるログインを積極的に検知・ブロックし、無理に自動化しようとするとあなたのGoogleアカウント自体が不審なアクセスとしてロックされるリスクがあるため、**ログイン処理そのものは自動化していない**
- 代わりに、**あなたが1回（またはセッションが切れるたびに）手動でログインし、その「ログイン済みの状態」だけを保存して使い回す**方式にしている（下記「買取スキャナーのログインセッションを取得する」参照）。アプリは保存されたセッションを読み込んで、ログイン操作なしでいきなり商品検索を行う
- 買取スキャナーの利用規約には自動化を名指しで禁止する条文は無いが、「サービス運営を妨害するおそれのある行為」「当社が不適切と判断する行為」という裁量条項があり、**アカウント停止のリスクをゼロにはできない**。利用は自己責任で行うこと
- **このアプリにはログイン機能が無い**。デプロイ先のURLを知っていれば誰でもあなたの買取スキャナーのセッションを使って検索できてしまう。個人利用のみを想定している
- サイトのHTML構造を確認できない状態で実装したため、**検索欄の操作や検索結果の読み取りが最初は失敗する可能性が高い**。失敗した場合は `https://<あなたのURL>/check?debug=1` でアクセスすると、失敗した画面のスクリーンショットが結果画面下部に表示されるので、それを見ながら調整する

### 🔑 買取スキャナーのログインセッションを取得する

Googleログイン自動化はしないため、**Node.jsが使えるパソコン（Mac/Windows）で1回だけ**この作業が必要です。iPhoneだけでは完結しません。

```bash
git clone <このリポジトリ>
cd price-tracker-app
npm install
npm run capture-scanner-session
```

1. 実際のChromeブラウザが開くので、**いつも通りGoogleアカウントでログイン**する
2. 「商品検索」画面が表示されたら、ターミナルに戻って Enter キーを押す
3. `scanner-session.json` が作成され、ターミナルにも1行のJSONが表示される
4. その中身をVercelの環境変数 **`KAITORI_SCANNER_STORAGE_STATE`** にそのまま貼り付けて保存
5. Vercelで **Redeploy**

セッションには有効期限があるため、**しばらく使っていて急に検索が失敗するようになったら、同じ手順でもう一度取得し直してください**（`session_expired` というエラーが出たらこれが原因です）。

価格・ポイント情報はWeb検索・画像認識で見つけた掲載値です。実際の査定額や還元条件は状態や時期で変わります。

## 🚀 Vercelへのデプロイ手順

### 1. GitHubにリポジトリを作成

1. [GitHub](https://github.com)にログイン
2. 「New repository」をクリック
3. リポジトリ名を入力（例: `price-tracker-app`）
4. 「Create repository」をクリック

### 2. コードをGitHubにアップロード

ターミナルで以下を実行：

```bash
cd price-tracker-app
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/price-tracker-app.git
git push -u origin main
```

※ `YOUR_USERNAME` を自分のGitHubユーザー名に置き換えてください

### 3. Vercelでデプロイ

1. [Vercel](https://vercel.com)にアクセス
2. 「Sign Up」してGitHubアカウントで登録
3. 「Add New Project」をクリック
4. GitHubリポジトリ `price-tracker-app` を選択
5. 「Environment Variables」に以下を追加：
   - Name: `ANTHROPIC_API_KEY` / Value: あなたのAnthropic APIキー（[こちら](https://console.anthropic.com/)で取得）
   - Name: `KAITORI_SCANNER_STORAGE_STATE` / Value: 買取スキャナーのログインセッション（後述「買取スキャナーのログインセッションを取得する」の手順で取得したもの。無くてもデプロイはできるが、その場合はWeb検索のみで動作する）
6. 「Deploy」をクリック

### 4. 完了！

数分後、デプロイが完了します。Vercelが自動生成したURLからアクセスできます。
例: `https://price-tracker-app.vercel.app`

## 📱 iPhoneでの使用方法

1. デプロイされたURLをSafariで開く
2. 共有ボタン → 「ホーム画面に追加」
3. アプリのように使えます！

## 🔑 APIキーの取得方法

1. [Anthropic Console](https://console.anthropic.com/)にアクセス
2. アカウント作成/ログイン
3. 「API Keys」セクションで新しいキーを作成
4. コピーしてVercelの環境変数に設定

## 💡 機能

- ✅ 商品ページのスクショ／URLから購入価格・ポイント・買取価格を自動収集し、差引利益を即判定
- ✅ 買取価格は「買取スキャナー」から取得（見つからない場合のみWeb検索にフォールバック）
- ✅ 購入価格・ポイントはその場で手直しして再計算可能（通信なし）
- ✅ スクリーンショットから自動データ抽出（複数商品比較表）
- ✅ 複数商品の一括処理
- ✅ 最高買取価格のハイライト
- ✅ CSV出力（Excel/Googleスプレッドシート対応）
- ✅ iPhone完全対応

## 🛠️ ローカルでの開発

```bash
# 依存関係のインストール
npm install

# 環境変数の設定（KAITORI_SCANNER_STORAGE_STATE は
# npm run capture-scanner-session で取得した1行のJSON）
cat <<EOF > .env.local
ANTHROPIC_API_KEY=your_api_key_here
KAITORI_SCANNER_STORAGE_STATE=your_captured_session_json
EOF

# 開発サーバー起動
npm run dev
```

ブラウザで `http://localhost:3000` を開く

## 📝 注意事項

- Anthropic APIキー・買取スキャナーのログインセッションは秘密情報です。GitHubにコミットしないでください（`scanner-session.json` は `.gitignore` 済み）
- APIの利用には料金がかかる場合があります
- 検索1回あたり30〜60秒ほどかかります（買取スキャナーでの検索＋Claudeでの画像/ページ読み取り。Vercelの関数タイムアウトは60秒に設定済み）
- 検索の深さは環境変数 `LOOKUP_EFFORT`（`low` / `medium` / `high`、既定は `low`）で調整できます。精度を上げたい場合は `medium` にしてください
- 買取スキャナーのChromiumバイナリ配布元バージョンを上げた場合は、`lib/scanner.js` の `CHROMIUM_PACK_URL`（または環境変数 `CHROMIUM_PACK_URL`）を対応するリリースのURLに更新してください
- 買取スキャナーのログインセッションには有効期限があります。急に検索が失敗するようになったら `npm run capture-scanner-session` で取得し直してください
