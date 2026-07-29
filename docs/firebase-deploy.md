# Firebase デプロイ手順と前提

Blazeプランへ切り替えた2026-07-27時点の記録。

## 前提(一度だけ)

### 1. Cloud Functions 用の Secret

```bash
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" \
  | firebase functions:secrets:set OTP_HASH_SECRET --data-file -
```

AUTH-004 の OTP をハッシュ化する鍵。ローカルの Emulator では
`functions/.secret.local`(gitignore対象)が使われる。

### 2. createCustomToken に必要な IAM 権限(付与済み)

`verifyEmailOtp` は Firebase Auth の Custom Token を発行する。Admin SDK は
サービスアカウントの秘密鍵を持たない環境では IAM の `signBlob` API で署名するため、
関数の実行サービスアカウントに **Service Account Token Creator** が必要になる。

付けないと次のエラーで失敗する。

```
FirebaseAuthError: Permission 'iam.serviceAccounts.signBlob' denied on resource
```

対象サービスアカウント: `19379486084-compute@developer.gserviceaccount.com`

```bash
gcloud iam service-accounts add-iam-policy-binding \
  19379486084-compute@developer.gserviceaccount.com \
  --member="serviceAccount:19379486084-compute@developer.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project=soroe-1850a
```

コンソールから行う場合は Google Cloud コンソール(Firebaseコンソールには無い)の
IAM と管理 → サービス アカウント → 上記アカウント →
**「アクセス権を持つプリンシパル」タブ** → 「アクセスを許可」で、
プリンシパルに**同じアカウント自身**を指定しロール
「サービス アカウント トークン作成者」を付与する。

```
https://console.cloud.google.com/iam-admin/serviceaccounts?project=soroe-1850a
```

自分自身を指定するのは、このサービスアカウントが自分の名前で JWT に
署名することを許可する設定だからで、誤りではない。

## デプロイ

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only functions
```

## 動作確認済みの範囲(2026-07-27)

Web preview から本番の Functions に対して、メール入力 → OTP発行 →
コード検証 → Custom Token でのサインイン → Firestore へのプロフィール作成 →
アプリ本体への到達までが通ることを確認した。

## 踏んだ落とし穴

### pnpm の `workspace:` プロトコルは Cloud Build で解決できない

`functions/package.json` に `"@soroe/shared": "workspace:*"` を宣言すると、
Cloud Build 上の `npm install` が `EUNSUPPORTEDPROTOCOL` で落ちる。

対処として `@soroe/shared` は依存として宣言せず、esbuild(`functions/build.mjs`)で
バンドルへ取り込む。型解決とテストは同じ位置を指す alias を
`functions/tsconfig.json` の `paths` と `functions/vitest.config.ts` に置いてある。
3か所は必ず揃えること。

### ビルド失敗後の再デプロイでは invoker の IAM が再設定されない

初回デプロイがビルドエラーで失敗すると、関数だけが作られて Cloud Run の
IAM 設定が適用されない状態になる。以降 `firebase deploy` は "updating" 扱いに
なり IAM を設定し直さないため、呼び出しが常に次のエラーで弾かれ続ける。

```
The request was not authenticated. Empty Authorization header value.
```

この状態になったら関数を削除して作り直す。

```bash
firebase functions:delete requestEmailOtp verifyEmailOtp --region us-central1 --force
firebase deploy --only functions:requestEmailOtp,functions:verifyEmailOtp
```

なお `requestEmailOtp` / `verifyEmailOtp` はサインイン前に呼ぶ必要があるため
`invoker: "public"` を指定している。これは Cloud Run 側の IAM を開けるだけで、
認証を無くす意味ではない。悪用はレート制限(メール/IP/端末)、試行回数上限、
登録有無を区別しない共通応答で抑えている。
