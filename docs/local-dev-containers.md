# ローカル開発用コンテナ(Firebase Emulator + Web版)

`docker compose up` で、Firebase Emulator と Web版(Expo)をローカルに立ち上げる。ブラウザだけで
リアルタイム共有まで確認でき、iOS Simulator / Android Emulator も同じEmulatorを使える。
本番配備には使わない(開発・検証専用)。

## 起動

```bash
docker compose up --build   # 初回はイメージのビルドに数分かかる
```

| サービス | 役割 | ホスト側のURL |
|---|---|---|
| `emulators` | Firebase Emulator(Auth / Firestore / Functions)とUI | UI: http://localhost:4000 |
| `web` | Web版の開発サーバー(Expo) | http://localhost:8082 |

公開ポートは `127.0.0.1` にだけバインドしている(LANへは公開しない)。

| ポート | 用途 |
|---|---|
| 4000 / 4400 | Emulator UI / Emulator Hub |
| 5001 | Functions |
| 8080 | Firestore |
| 9099 | Auth |
| 8082 | Web版 |

停止は `docker compose down`。データはコンテナ内にしか無く、停止すると消える(毎回まっさらな状態になる)。

## ブラウザで確認する(2ユーザー)

Web版は購読(`onSnapshot`)を使うため、リスト一覧・共有・リアルタイム反映までブラウザで動く。
2ユーザーで確認するには、**オリジンが違う**2つのタブ(ログイン状態がタブ間で共有されないようにするため)を使う。

- 1人目: http://localhost:8082
- 2人目: http://127.0.0.1:8082

ログインは「メールで続ける」。確認コードはEmulatorのログに出る。

```bash
docker compose logs emulators | grep "OTP for"
```

Apple / Googleでのログインは、Emulatorでは使えない。

## iOS Simulator / Android Emulator から同じバックエンドを使う

ホストのMetroを、コンテナのEmulatorへ向けて起動する(ポートはホストへ公開済み)。

```bash
cd apps/mobile
# iOS Simulator: localhost。Android Emulator: 10.0.2.2
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=localhost npx expo start --dev-client --port 8081
```

ネイティブのDevelopment Buildの作り方と、iOSで必要な設定(Podの静的フレームワーク設定・署名)は
`docs/share-005-ac01.md` を参照。Web版とネイティブ版は同じEmulatorを見るので、ブラウザのユーザーと
Simulatorのユーザーが同じリストを共有できる。

## 変更の反映

- `apps/mobile/src` はバインドマウントされ、Web版は保存すると再読み込みされる。
- `firestore.rules` / `functions/src` / `packages/shared/src` を変えたら、`docker compose restart emulators`
  (起動時にFunctionsを再ビルドする)。
- 依存(`package.json` / `pnpm-lock.yaml`)や `docker/` を変えたら `docker compose up --build`。

## 仕組みと制約

- イメージは1つ(Node 22 + Java 21 + pnpm + 依存 + Emulator実行ファイル)で、`emulators` と `web` が共用する。
  `node_modules` はイメージの中に持ち、ホスト(macOS)のものは持ち込まない(`.dockerignore`)。
- EmulatorはコンテナのEmulator専用設定 `firebase.container.json` で `0.0.0.0` にバインドする
  (ホスト用の `firebase.json` は `127.0.0.1` のまま)。
- メールOTPのシークレットはEmulator専用の固定値(`OTP_HASH_SECRET`、既定 `container-dev-secret`)。
- Web版の `EXPO_PUBLIC_FIREBASE_WEB_*` はEmulator接続では使われないダミー値。`projectId` だけは
  Emulatorのプロジェクト(`soroe-1850a`)と揃えている。
- 本番のFirebaseへは接続しない。Web版には「Emulatorモード」の注意帯が出る。
- Web版はオフライン永続化を使わない(リロードするとキャッシュは残らない)。
- Web版は認証状態も永続化しない。**ページを再読み込みするとログアウト**し、URLを直接開いた画面は
  ログインへ戻る。確認はログイン後、画面内の遷移で行う。
- `Alert.alert` はWebでは何も表示されない(React Native Webの仕様)。リスト詳細のメニュー(共有・
  アーカイブ等)と、取消・削除・退出などの確認ダイアログはWeb版では動かない。共有画面を見たいときは、
  ログイン後にブラウザのコンソールで次を実行して画面内遷移する(`<listId>` は一覧のURLから取る)。

  ```js
  history.pushState({}, '', '/list-share?listId=<listId>');
  dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  ```

  Web版でのダイアログ対応は別チケットで扱う(本コンテナ構成の対象外)。
