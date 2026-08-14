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
2. Web検索で日本国内の買取店の買取価格を確認する（推測値は使わない）
3. `差引利益 = 買取価格 − (購入価格 − ポイント還元額)` をアプリ側で計算し、プラスなら🟢買い時、マイナスなら🔴損と即座に表示
4. 読み取った購入価格・ポイントは画面上で手直しでき、編集すると通信なしでその場再計算される

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
   - Name: `ANTHROPIC_API_KEY`
   - Value: あなたのAnthropic APIキー（[こちら](https://console.anthropic.com/)で取得）
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

# 環境変数の設定
echo "ANTHROPIC_API_KEY=your_api_key_here" > .env.local

# 開発サーバー起動
npm run dev
```

ブラウザで `http://localhost:3000` を開く

## 📝 注意事項

- Anthropic APIキーは秘密情報です。GitHubにコミットしないでください
- APIの利用には料金がかかる場合があります
- URL検索はWeb検索を行うため、1回あたり30〜60秒ほどかかります（Vercelの関数タイムアウトは60秒に設定済み）
- 検索の深さは環境変数 `LOOKUP_EFFORT`（`low` / `medium` / `high`、既定は `low`）で調整できます。精度を上げたい場合は `medium` にしてください
