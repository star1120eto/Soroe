# 実装時の不変条件

破ると後から作り直しになるものだけを集めてある。実装前にこのファイルの該当節を確認する。
根拠のソースを併記してあるので、疑わしいときはそこを見る。

## 1. 書き込み経路の分離

Firestore への書き込みには2経路しかない。どちらを使うかは「サーバー側で原子的に判定すべき値があるか」で決まる。

| 対象 | 経路 | 理由 |
|---|---|---|
| リスト作成・複製・削除・アーカイブ解除 | Callable Functions（Admin SDK） | Free上限と所有権を原子的に判定する必要がある |
| メンバー追加・削除・所有権移譲・招待受諾 | Callable Functions | 権限変更の検証を伴う |
| `users/{uid}/listRefs/{listId}`（一覧用の非正規化参照） | Firestore trigger（`syncListRef`） | 集計値の整合はサーバーが持つ |
| リストの `name` / `color` / `icon` / `updatedAt` | client write（owner限定） | 表示用の情報のみ。Rules で affectedKeys を限定済み |
| 項目（`lists/{listId}/items/{itemId}`）のCRUD | client write（メンバー） | **オフラインで完結する必要がある**。ここを Functions にするとオフライン体験が壊れる |

`firestore.rules` が正。Rules を変えたら `functions/src/rules/firestore.rules.test.ts` にケースを足す。

物理削除は許可しない。項目もリストも論理削除（`deletedAt`）で運用し、30日後にサーバーが消す。

## 2. 冪等性

書き込み系の Callable API は `requestId` を必須にする。同一 `uid + requestId` は同じ結果を返す（`PD` L887-895）。

通信断や連打で二重実行されるのが前提の設計。`functions/src/lists/createList.ts` が実装の前例。

## 3. Free上限

上限判定はサーバーで原子的に行う。クライアント側の件数表示は目安であり権威ではない。

- アクティブリスト3件（`PD` L209-218、`SPEC` L30-38）
- マイテンプレート1件（v1.0 ではテンプレート機能自体が対象外）

**v1.0 でも上限を維持する。** 無制限で公開してから v1.1 で制限を入れると、超過データの読み取り専用化処理と、機能を取り上げる説明が必要になる。

上限到達時の文言は「現在は3つまで作成できます」に留める。「Premium で近日解放」のような未提供機能の予告は App Store Guideline 2.3 に触れる。

## 4. 型の境界

Firestore の型（`Timestamp`、`DocumentSnapshot` 等）を UI やドメイン層へ直接公開しない。

共有スキーマ（`packages/shared`）では時刻をミリ秒epochの `number` として扱う。プラットフォームごとに `Timestamp` 実装が異なるため。変換は `apps/mobile/src/features/lists/converters.ts` のような converter 層に閉じる。

## 5. 個人情報

リスト名、項目名、メールアドレス、AI自由入力を**ログにも Analytics にも送らない**（`PD` L655-665）。

OBS-001 では「送らないこと」をテストで担保する。人間の注意力で守るものではない。デバッグ時に一時的に `console.log` した内容をコミットしないよう、`pnpm run ci` 前に diff を見る。

## 6. アクセシビリティ・多言語

- 主要操作にアクセシビリティラベルを付ける
- タップ領域は 44×44pt 以上
- 表示文言は日本語・英語リソースを経由する（ハードコードしない）
- Dynamic Type で崩れない

`PD` L666-685。QA-003 でまとめて確認するが、各チケットの時点で満たしておかないと後で全画面を直すことになる。

## 7. デザイントークン

- 色は `apps/mobile/src/design-system/tokens/colors.ts` の semantic token から選ぶ。**新規HEX値を増やさない**
- アイコンは `apps/mobile/src/design-system/icons/ph-icon-paths.ts` にバンドル済みの24種のみ。ランタイムの Iconify API へ依存しない
- 見出しは Zen Maru Gothic、本文とUIは Noto Sans JP
- **Light Mode のみ。** Dark Mode は semantic token で将来対応可能にするが v1.0 では実装しない

## 8. 画面の状態

画面チケットは通常・空・読込・エラー・無効・オフラインのうち該当する状態を全部実装する（`SPEC` L52-66）。

`apps/mobile/src/design-system/components/` に `EmptyState` / `ErrorState` / `Skeleton` / `Banner` が揃っているので、独自実装を増やさない。

## 9. テストの慣習

このリポジトリの既存の線引き。従わないとレビューで揺れる。

| 対象 | 単体テスト |
|---|---|
| `packages/shared` のスキーマ | 書く（テスト先行） |
| Functions の handler / オーケストレーション層 | 書く。store層をmockする |
| Functions の store 層（Firestore直叩き） | **書かない**（`functions/src/emailOtp/otpStore.ts` が前例） |
| Security Rules | `functions/src/rules/firestore.rules.test.ts` に書く（Emulator） |
| design-system のコンポーネント | 書く |
| `apps/mobile/src/app/` 配下の route component | **書かない**。Emulator + 実機で確認する |

## 10. Expo / ネイティブ

Expo SDK 57。API を新しく使うときは記憶で書かず https://docs.expo.dev/versions/v57.0.0/ の該当ページを確認する（`apps/mobile/AGENTS.md`）。破壊的変更が多く、古い書き方は実機ビルドまで気づけない。

`app.config.ts` は EAS の環境変数で Firebase 設定ファイルを受け取る前提。`google-services.json` と `GoogleService-Info.plist` はリポジトリに入れない。

`react-native-purchases` は依存に残っているが、**v1.0 では SDK を初期化しない**。App Store Connect にも課金アイテムを登録しない。

## 11. 秘密情報

Functions の秘密は Firebase Secret Manager（`firebase functions:secrets:set`）。ローカル Emulator は `functions/.secret.local`（gitignore対象）。`OTP_HASH_SECRET` が前例で、手順は `docs/firebase-deploy.md` にある。

APIキーやトークンをコードにも `app.config.ts` にも書かない。`EXPO_PUBLIC_` 接頭辞の環境変数はクライアントへバンドルされるので秘密を入れない。
