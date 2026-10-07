# ローカル開発用イメージ(Firebase Emulator と Web版の開発サーバーで共用する)。
# 本番配備には使わない。手順は docs/local-dev-containers.md。
FROM node:22-trixie-slim

# Firestore Emulatorに必要なJava(firebase-toolsはJDK 21以上を要求する)とcurl(healthcheck)。
RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-21-jre-headless curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# 依存を先に入れてレイヤーキャッシュを効かせる(マニフェストだけを先にコピーする)。
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/
COPY functions/package.json functions/
COPY packages/shared/package.json packages/shared/
RUN corepack prepare --activate \
 && pnpm install --frozen-lockfile

# Emulatorの実行ファイルを焼き込む(起動のたびにダウンロードしない)。
RUN functions/node_modules/.bin/firebase setup:emulators:firestore \
 && functions/node_modules/.bin/firebase setup:emulators:ui

COPY . .
COPY docker/entrypoint-emulators.sh docker/entrypoint-web.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint-emulators.sh /usr/local/bin/entrypoint-web.sh
