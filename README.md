# 買取価格比較ツール

スクリーンショットから商品の買取価格を自動抽出し、比較表を作成するWebアプリです。

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

- ✅ スクリーンショットから自動データ抽出
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
