# VPSで常時稼働させる場合用。ローカルPCで動かすだけなら不要です。
# Playwright公式イメージにはChromiumと必要なライブラリが同梱されています。
#
# 【重要】このタグの版と package.json の playwright の版は必ず一致させること。
# ずれると同梱ブラウザを見つけられず "Executable doesn't exist" で起動しません。
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY selectors.json ./

# data/ はホストからマウントする（auth.json・state.json・画像を永続化するため）
VOLUME ["/app/data"]

# 承認画面。コンテナ外から見るにはポート公開が必要（compose側で設定）
EXPOSE 8787

ENV NODE_ENV=production

CMD ["node", "src/cli.js", "watch"]
