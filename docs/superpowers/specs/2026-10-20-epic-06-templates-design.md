# EPIC-06 公式テンプレート・マイテンプレート 設計

対象: `docs/soroe-implementation-backlog.md` の TMPL-001〜004。
受け入れ条件の正は `docs/soroe-functional-specification.md` の 7章(TMPL-01 / TMPL-02 / MYTM-01 / MYTM-02)、
AC-04、2.6 多言語、`docs/family-checklist-product-design.md` の 6.7 / 6.8 / 11章 / 12章。

## 1. 目的と背景

準備の手間を減らし、2件目のマイテンプレート・4件目のリストで課金の理由が自然に生じる導線を作る。
公式テンプレートから不要な項目を外してリストを作れ、いまのリストを独立したマイテンプレートとして
保存・再利用できる。

## 2. 現状

- 「テンプレート」タブは空の画面(プレースホルダー)。
- リストの作成・複製は Cloud Functions(`createList` / `duplicateList`)で、上限(Free 3件)を同じ
  transaction 内で判定する。項目の複製は transaction の外で分割 batch(400件ずつ)。
- プランは `getPlan(uid)`(`entitlements/{uid}`、無ければ Free)。RevenueCat 連携(EPIC-08)は未実装。
- 言語設定(日本語/English)は保存されるが、画面文言は日本語のみ。

## 3. ゴール・非ゴール・アンチゴール

**ゴール**

- 初期10件の公式テンプレート(日英)を、レビューできる形(リポジトリ内のJSON)で持ち、検証・投入
  コマンドで Emulator / 本番へ反映できる。件数はJSONの追加だけで20〜30件へ増やせる。
- 公式一覧・詳細・項目選択・人数補正・通常リストへの複製。安全関連は保存前に注意を表示。
- 公式一覧はキャッシュ済みならオフラインで読める。
- リストからのマイテンプレート保存、一覧、名前・説明の変更、項目の削除、テンプレートの削除、
  リスト作成。保存と作成は Functions で上限を判定する(Free はマイテンプレート1件)。
- 元のテンプレート・元のリストを変えても、作成済みのリストや保存済みのテンプレートは変わらない。
- AC-04 を Emulator の通しテストにして CI に入れる。

**非ゴール**

- 検索・カテゴリ絞り込み(P1)、項目の追加・名前変更・並べ替え(テンプレート側の編集)。
- Premium 失効後に「使う1件を選ぶ」画面と、ロック表示(課金 EPIC-08 と一緒に作る)。
- 分析イベントの送信(EPIC-10)。公開テンプレート(Phase 2)。管理画面。
- 公式テンプレートの英語文言の翻訳レビュー(下書きは私が書き、確認はあなた)。

**アンチゴール**

- 保存したマイテンプレートに、共有メンバー・担当者・作成者・完了者・履歴が混ざる。
- テンプレートからの作成が、リスト上限を超えて通る(Functions の transaction で判定する)。
- 元のテンプレート・リストの変更が、作成済みのものへ波及する。

## 4. 設計

### 4.1 データ(共有スキーマは `packages/shared`)

- `officialTemplates/{id}`: `category`(`shopping|family-trip|outing|outdoor|school|home`)、`priority`、
  `published`、`listType`(`shopping|packing|task`)、`icon`(`ph:*` のアイコン名)、`adjustableByPeople`、
  `defaultPartySize`(1〜10)、`hasSafetyNotice`、`itemCount`、`ja` / `en`(`title`・`description`・`notice`)。
- `officialTemplates/{id}/items/{itemId}`: `sortOrder`、`quantity`、`perPerson`(人数ごとの数量か)、
  `ja` / `en`(`name`・`unit`・`category`・`note`)。
- `users/{uid}/myTemplates/{id}`: `title`、`description`、`listType`、`icon`、`color`、`itemCount`、
  `items`(配列。各要素 `id`・`name`・`quantity`・`unit`・`category`・`note`・`checked`)、`createdAt`、
  `updatedAt`。担当者・作成者・完了者・履歴は持たない。テンプレート単位のカテゴリは持たない
  (**私の判断**: 仕様の「カテゴリ」は項目ごとのカテゴリとして保存する。リストにテンプレート単位の分類が無い)。
- 公式テンプレートのJSONは `functions/data/official-templates/<id>.json`(テンプレート本体と項目を1ファイル)。
  `validate` が共有スキーマで検証し(ID重複・日英の欠落・項目数の一致も確認)、`seed` が Firestore へ書く。

### 4.2 Rules

- `officialTemplates` と `items`: サインイン済みなら読める。書込は全拒否(seed は Admin SDK)。
  一覧は `published == true` で絞って読む。
- `users/{uid}/myTemplates/{id}`: 本人のみ読める。作成は拒否(Functions 経由)。更新は本人のみで、変えられるのは
  `title`・`description`・`items`・`itemCount`・`updatedAt` だけ。`items` は**減る方向のみ**(件数が増えない)。
  削除は本人のみ可。

### 4.3 Cloud Functions

- `saveMyTemplate({listId, title, description, requestId})`: 呼び出し元がリストのメンバー(owner / editor)で、
  リストが削除されていないこと。Free で既に1件あれば `resource-exhausted`。削除されていない項目だけを
  `sortOrder` 順に保存し、`checked` に完了状態を写す。`requestId` で冪等(再送は同じ `templateId`)。
- `createListFromTemplate({source, templateId, itemIds, partySize, language, requestId})`:
  `source` は `official` / `my`。公式は `published` のものだけ。選んだ項目だけでリストを作る。
  リスト上限(Free 3件)を transaction 内で判定し、超えると `resource-exhausted`。項目は transaction の外で
  400件ずつの batch に分ける(既存 `duplicateList` と同じ)。人数補正(公式のみ): `perPerson` の項目の数量に
  `partySize` を掛ける。リスト名は `language` の `title`(60文字まで)。`requestId` で冪等。
- どちらも `users/{uid}/…Requests/{requestId}` に成功時だけ記録する(既存の作法)。

### 4.4 画面

- 「テンプレート」タブを「公式 / マイ」の2区分にする。公式は、カード(名称・説明・件数・アイコン)の一覧。
  マイは、保存済みの一覧(Free は1件)。
- 詳細(`template-detail`、公式・マイ共通): 名称・説明・注意事項・項目。初期状態は全項目が選択済みで、外せる。
  人数補正のあるテンプレートは人数(1〜10)を指定できる。「リストを作成」で Functions を呼び、作成したリストを開く。
  `hasSafetyNotice` のものは、作成前に確認ダイアログで注意事項を表示する。上限のときは、既存の
  上限メッセージ(リスト3件)を出す。
- マイの詳細には、「名前・説明を変更」「項目を外す(選択でなく削除)」「テンプレートを削除」を置く。
- リスト詳細のメニューに「マイテンプレートに保存」を足す。タイトル・説明を入れて保存する。上限のときは
  「既存のテンプレートを確認する / 後で」を出す(課金導線は EPIC-08)。
- 言語は設定の言語で、公式の `ja` / `en` を切り替える。未設定の文言(英語が空)は日本語へ落とす。
- 公式の一覧・詳細はオフラインで読める(Firestore のキャッシュ)。作成・保存はオンライン必須で、
  オフライン時は押せず理由を出す(EPIC-05 の仕組み)。

### 4.5 テスト

- Functions: store の Emulator 統合テスト(保存・作成・上限・冪等・独立性)、handler の単体テスト。
- Rules: 公式の読取、マイテンプレートの更新の制限(項目の追加不可、他人の読取不可)。
- 公式JSONの検証テスト(スキーマ・ID重複・日英・項目数)。
- モバイル: 純粋関数(人数補正・選択・日英の選択)、画面テスト。
- AC-04: Emulator の通しスクリプト(`e2e:templates`)を CI に追加し、`docs/tmpl-004-ac04.md` に記録する。

## 5. 制約

- ネイティブ依存を追加しない。UIに絵文字・Unicode記号をアイコンとして使わない(`ph:*` を使う)。
- 実機は使えない(ENV-002)。Emulator と画面テストで確認する。

## 6. 実装者に任せる点

- 公式テンプレート10件の内容(日英。下書きは私が書き、あなたが確認する)。
- 画面の見た目・文言の細部(既存の design-system を使う)、エラー文言。
