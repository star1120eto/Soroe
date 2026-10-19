#!/bin/sh
# Firebase Emulator(Auth / Firestore / Functions)を起動する。
set -eu
cd /app

# メールOTPのハッシュ用シークレット(Emulator専用の固定値。本番の値ではない)。
if [ ! -f functions/.secret.local ]; then
  echo "OTP_HASH_SECRET=${OTP_HASH_SECRET:-container-dev-secret}" > functions/.secret.local
fi

# Functionsのソース変更を反映するため、起動のたびにビルドする。
pnpm run build:shared
pnpm run build:functions

exec functions/node_modules/.bin/firebase emulators:start \
  --config firebase.container.json \
  --only auth,firestore,functions \
  --project "${GCLOUD_PROJECT:-soroe-1850a}"
