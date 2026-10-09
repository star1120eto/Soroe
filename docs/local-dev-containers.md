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

## テストデータを入れる(シーダー)

Emulator起動中に、ホストから次を実行する(`docker compose up` 後。Emulatorを作り直すと消えるので毎回実行する)。

```bash
pnpm run seed -- a@example.test                 # 所有者のメール
pnpm run seed -- a@example.test --name たろう   # 表示名を指定(ユーザー新規作成時)
```

- 買い物・持ち物・やることの3種類のリスト(完了済みの項目あり)と、アーカイブ済みのリストを1つ作る。
  「週末のキャンプ」には招待リンク2本(未使用)も付き、リンクは実行結果の末尾に出る。
- リストはアプリと同じCallableで作るため、メンバー・一覧・「◯/◯完了」の件数が実際の経路どおりに整う。
- 指定メールのユーザーが無ければ、Authのユーザーとプロフィールを作る。そのメールでログインすると
  (確認コードは上記のログから取得)、プロフィール設定を飛ばしてそのまま一覧へ進む。
- 2人目の確認: 別のメールのユーザーを別オリジンのブラウザでログインさせ、結果末尾の招待リンクを開いて参加する。
- Freeプランのアクティブリスト上限(3件)があるため、同じメールで繰り返すと上限超過分はスキップされる。
  やり直すときは別のメールで実行するか、`docker compose down` してから起動し直す。

## iOS Simulator / Android Emulator から同じバックエンドを使う

ホストのMetroを、コンテナのEmulatorへ向けて起動する(ポートはホストへ公開済み)。

```bash
cd apps/mobile
# iOS Simulator: 127.0.0.1。Android Emulator: 10.0.2.2
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 npx expo start --dev-client --port 8081
```

iOS Simulatorでは `localhost` ではなく **`127.0.0.1`** を指定する。`localhost` はIPv6(`::1`)へ先に
解決され、コンテナの公開ポート(IPv4のみ)につながらない。Firestoreの通信はIPv4へ切り替わらないため、
書込が届かず「未同期の変更があります」の帯が出続ける。

ネイティブのDevelopment Buildの作り方と、iOSで必要な設定(Podの静的フレームワーク設定・署名)は
`docs/share-005-ac01.md` を参照。Web版とネイティブ版は同じEmulatorを見るので、ブラウザのユーザーと
Simulatorのユーザーが同じリストを共有できる。

## Emulatorを作り直したあとの注意(ログインの食い違い)

`docker compose down` などでEmulatorを作り直すと、Authのユーザーが消える。iOS Simulator / ブラウザに
前のログインが残っていると、アプリは存在しないユーザーのままになり、Firestoreの通信が
`An internal error has occurred` で失敗する(書込が届かず「未同期の変更があります」が出続ける)。
その場合は、アプリの設定から**ログアウトして入り直す**(シーダーで作ったメールでログインし直す)。

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
- Web版のログイン状態はブラウザの `localStorage` に保存され、再読み込みしても維持される
  (`@react-native-firebase/auth` のWeb実装はメモリ保存のため、`patches/` のパッチでブラウザ保存にしている)。
  ただしコンテナを作り直すとEmulatorのユーザーが消えるため、その場合は保存済みの状態でも再ログインが必要になる。
- `Alert.alert` はReact Native Webでは何も表示されないため、Webでは `src/lib/webAlert.ts` が
  DOMのモーダルへ差し替える(`_layout.tsx` で有効化)。メニュー・確認ダイアログはネイティブと同じ
  ボタン構成で出る。背景タップ・Escはキャンセル扱い。
