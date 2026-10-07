#!/bin/sh
# Web版(Expo)の開発サーバーを起動する。
set -eu
cd /app

pnpm run build:shared

cd apps/mobile
# EXPO_PUBLIC_FIREBASE_EMULATOR_HOSTは「ブラウザから見た」ホスト名(ホストへ公開したポート)。
exec npx expo start --web --port 8082
