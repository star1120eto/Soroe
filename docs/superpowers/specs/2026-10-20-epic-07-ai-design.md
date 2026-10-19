# EPIC-07 AIリスト生成 設計

対象: `docs/soroe-implementation-backlog.md` の AI-001〜005。
受け入れ条件の正は `docs/soroe-functional-specification.md` の 8章(AI-01〜05)、9章 LIMIT-02、AC-05、
定数表(最大80件・30秒・日本時間の月)と、`docs/family-checklist-product-design.md` の 6.9。

## 1. 目的と背景

条件(用途・人数・年齢帯・期間・季節・特徴・自由記述)から、最大80項目の構造化されたリストを生成し、
編集・除外してから通常リストとして保存できるようにする。Free は生涯1回、Premium は日本時間の暦月20回で、
失敗・安全拒否・キャンセルでは回数が戻り、同じ `requestId` の再送で二重に消費されない。

## 2. 現状

- 「AI生成」タブは空のプレースホルダー。Callable は `getPlan(uid)`、`consumeRateLimit`(固定窓)を使える。
- リスト作成(`createList` / `createListFromTemplate`)は、上限判定を transaction、項目を400件ずつの batch で行う。
- 課金(EPIC-08)は未実装。Premium は `entitlements/{uid}.plan` の値で判定する。
- OpenAI の API キー・実際のモデル名は未確定(外部準備)。

## 3. ゴール・非ゴール・アンチゴール

**ゴール**

- 入力・出力のスキーマ(共有)、回数の予約→確定/返却の状態機械、Free 生涯1回と Premium 日本時間の月20回の原子的な判定。
- `generateList`(呼び出し部分を差し替えられる `AiClient` 経由。30秒、形式不正/一時エラーは1回だけ再試行、同時1件、最大80件、
  サーバーでの再検証、安全拒否)。キャンセル、残り回数の取得。
- 3ステップの条件入力、確認、生成中、結果の編集・除外・保存・評価。アプリ再開時の結果の復元。「次回も使う」の条件保存。
- 保存はサーバーで、保存直前のリスト上限を判定する。
- 50ケースの評価セットと判定関数(実行はキーが用意できてから)。AC-05 の Emulator 通しテスト。

**非goal**

- 実際の OpenAI クライアントの実装と、実 API での確認(別チケット)。モデルの選定。
- 課金の導線(Premium を見る)。上限画面は回数と次のリセット日時の説明まで。
- 生成結果の履歴一覧画面(直近の未保存の結果の再表示のみ)。分析イベントの送信(EPIC-10)。

**アンチゴール**

- 同じ `requestId` の再送・同時実行で、回数が二重に引かれる、または結果が二重に作られる。
- 失敗・安全拒否・キャンセルなのに、回数が戻らない。
- 結果が80件を超える、または空・形式不正のまま保存できてしまう。
- 他のユーザーの生成結果を読める。

## 4. 設計

### 4.1 共有スキーマ(`packages/shared`)

- 入力 `aiGenerationInputSchema`: `useCase`(`travel|shopping|hiking|school|custom`)、`customText`(最大500・`custom` のとき必須)、
  `adults` / `children`(0〜20、合計1以上)、`ageBands`(`infant|preschool|elementary|teen`。子どもがいるときだけ1つ以上)、
  `nights`(0〜14。0は日帰り)、`season`(`spring|summer|autumn|winter` または null)、`features`(`car|rain|hot-spring|meals-included|beginner`)、
  `notes`(最大500)、`language`。
- 出力 `aiResultSchema`: `title`(1〜60)、`listType`、`category`、`safetyNotice`、`items`(1〜80。各 `name`・`quantity`・`unit`・`category`・
  `reason`(100文字まで)・`priority`(`essential|nice-to-have`))。
- Callable の入出力(応答は `status` つきの union): `generateList`、`cancelGeneration`、`getAiQuota`、`saveAiResult`、`rateAiResult`。

### 4.2 回数の状態機械(`aiRequests` / `aiUsage`)

- `aiRequests/{uid}_{requestId}`: `uid`、`status`(`reserved|succeeded|failed|refused|cancelled|saved`)、`usageKey`、`input`、`result`、
  `message`、`listId`、`rating`、時刻。本人だけが読める(Rules)。書込は Functions のみ。
- `aiUsage/{uid}_lifetime`(Free)と `aiUsage/{uid}_{yyyyMM}`(Premium、日本時間の月): `count`。予約時にプランで使う方を決め、
  返却は予約時の `usageKey` を戻す。
- 予約(transaction): 同じ `requestId` が既にあれば消費せず現在の状態を返す。上限なら `limit-reached`。
  同時に生成できるのは1件で、`users/{uid}/aiState/active` に予約中の `requestId` を持つ(2分を過ぎたものは失効とみなし、
  失敗にして回数を戻してから新しい予約を受ける)。
- 確定: 成功は回数を残す。失敗・安全拒否は回数を戻す。キャンセル済みの結果は捨てる。成功後に結果を捨てても戻さない。
- キャンセル: 予約中なら `cancelled`+返却。完了済みなら何もしない。

### 4.3 生成(`generateList`)

- 順序: 入力検証 → レート制限(1分5回) → プランとモデル名(`config/ai`、無ければ既定値) → 予約 → `AiClient.generate` → 検証・整形 → 確定。
- `AiClient`: `generate(input, {model, signal})` が `{kind:'ok', raw}` または `{kind:'refusal', message}` を返すインターフェース。
  `AI_CLIENT=fake` のとき決まった結果を返す実装(Emulator・CI用。テスト用の合言葉でも失敗・拒否・遅延を起こせる)。
  未設定のときは「AI生成は準備中です」と失敗(回数は戻る)。
- 30秒でタイムアウト。形式不正・一時エラーは1回だけ再試行する。安全拒否は再試行しない。
- 整形: 空白を除き、同名(大小・空白を無視)の重複を除き、80件に切る。1件も残らなければ失敗。
- 応答: `succeeded`(結果つき)、`in-progress`、`refused`、`failed`、`limit-reached`(残り回数つき)、`busy`、`cancelled`。

### 4.4 保存・評価

- `saveAiResult({requestId, title, listType, items})`: 本人の `succeeded` の結果だけ。編集後の項目(1〜80、スキーマで検証)で通常リストを作る。
  リスト上限(Free 3件)を transaction 内で判定し、超えたら `limit-reached`。保存後は `saved`(再送は同じ `listId`)。
- `rateAiResult({requestId, rating})`: `helpful|insufficient` を記録する。

### 4.5 画面

- AI タブ: 残り回数(Free は「無料1回」、Premium は月20回と次のリセット日時)、「リストを作る」、未保存の結果があれば「前回の結果を見る」。
  上限のときは理由とリセット日時(Free は課金導線が EPIC-08 で入るまで説明のみ)。オフラインは押せず理由を出す。
- 条件入力: 3ステップ(①用途 ②人数と年齢帯 ③期間・季節・特徴・自由記述)→確認(「次回も使う」で条件を保存)。戻って編集できる。
- 結果画面(`requestId` で状態を購読): 生成中(キャンセル)/ 結果(項目の選択解除・追加・編集・削除、タイトル・種別の変更、
  AI生成であることと確認が必要な注意、登山・防災・医療は専門機関の注意)/ 失敗・安全拒否・キャンセルのメッセージ。保存と評価。
- アプリを開き直したら、保存しておいた `requestId` の状態から結果を復元する(AsyncStorage)。

### 4.6 評価セットとテスト

- `functions/ai-eval/`: 旅行・登山・買い物・学校行事の50ケース(JSON)と、判定関数(スキーマ適合・80件以内・重複・危険な提案・人数/季節の反映)。
  判定自体はフィクスチャでテストし、実 API での実行はキーが用意できてから。
- Functions: store の Emulator 統合テスト、handler の単体テスト。Rules テスト。
- AC-05: Emulator の通しスクリプト(`e2e:ai`)を CI に追加し、`docs/ai-005-ac05.md` に記録する。

## 5. 制約

- ネイティブ依存を追加しない。UIに絵文字・Unicode記号をアイコンとして使わない。
- 実機・実 API は使えない。回数の判定はクライアントの申告を信用しない(すべてサーバー)。

## 6. 実装者に任せる点

- 偽のクライアントが返す項目の中身、画面の見た目・文言、エラー文言。
