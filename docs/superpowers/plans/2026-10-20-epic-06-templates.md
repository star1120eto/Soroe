# EPIC-06 公式テンプレート・マイテンプレート Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公式テンプレート(初期10件・日英)から不要項目を外してリストを作れ、リストをマイテンプレートとして保存・再利用できる。保存と作成は Functions で上限を判定する。

**Architecture:** 共有スキーマ(`packages/shared`)を単一の型の源にし、公式テンプレートはリポジトリ内のJSONを `validate` / `seed` で Firestore へ反映する。保存・作成は Callable(transaction + 分割batch、`requestId` で冪等)。モバイルは公式の購読(完全版SDKの`*.web.ts`を含む)と Callable クライアント、純粋関数(選択・人数補正・言語選択)、画面(タブ・詳細・保存)に分ける。

**Tech Stack:** zod(`@soroe/shared`)、Cloud Functions v2 + Admin SDK、Vitest(functions / shared)、Jest + @testing-library/react-native、Firebase Emulator、Node `.mjs`。

**Spec:** `docs/superpowers/specs/2026-10-20-epic-06-templates-design.md`(機能仕様書 7章・AC-04)。

## Global Constraints

- 上限: Free のマイテンプレートは **1件**、アクティブリストは **3件**(Premium は無制限。`getPlan(uid)` を使う)。
- 文字数: テンプレート名 1〜60、説明 1〜200、注意事項 1〜300、項目名 1〜100、メモ最大 500。人数は 1〜10。
- 公式カテゴリ: `shopping` `family-trip` `outing` `outdoor` `school` `home`(この6つのみ)。
- 公式テンプレートは `published == true` のものだけ読める/作れる。書込はクライアントから全拒否。
- ネイティブ依存を追加しない。UIに絵文字・Unicode記号をアイコンとして使わない(`ph:*` のみ)。
- Callable の想定内の不成立は `HttpsError`(`resource-exhausted` 上限、`not-found`、`invalid-argument`)。既存 `createList` と同じ作法。
- native と web の Repository は同じシグネチャ(`typeof Native.xxx`)。
- CLAUDE.md: 作業後は PR を作り、CI 通過後に `code-review` でセルフレビューする。

## Review Focus

1. 同じ `requestId` の再送で、リスト・マイテンプレートが二重に作られない → Task 4 の統合テスト。
2. `itemIds` に、そのテンプレートに無いIDが混ざる → `invalid-argument` で拒否し、何も作らない(Task 4)。
3. `published == false` の公式テンプレートは、閲覧も作成もできない(Task 3 の Rules テスト、Task 4)。
4. 人数補正: `quantity == null` の項目は null のまま、`perPerson == false` は変えない、人数が範囲外は拒否(Task 1 / 4)。
5. 項目が0件のリストはマイテンプレートに保存できない(`invalid-argument`)(Task 4)。
6. 保存後に元リストを変更・削除しても、保存済みのマイテンプレートは変わらない(Task 4、Task 8 の通し)。

## File Structure

- `packages/shared/src/schemas/template.ts` — 公式・マイテンプレートと Callable の入出力スキーマ、`scaleQuantity`。
- `functions/data/official-templates/*.json`、`functions/scripts/official-templates.mjs` — 公式テンプレートの内容と validate / seed。
- `functions/src/templates/{templateStore.ts,saveMyTemplate.ts,createListFromTemplate.ts}` — サーバー処理。
- `firestore.rules`、`functions/src/rules/firestore.rules.test.ts` — Rules。
- `apps/mobile/src/features/templates/` — Repository(native / web)、Callable クライアント、変換、純粋関数。
- `apps/mobile/src/app/(app)/templates.tsx`、`template-detail.tsx`、`save-template.tsx`、`list/[listId].tsx` — 画面。
- `apps/mobile/scripts/e2e-templates-ac04.mjs`、`docs/tmpl-004-ac04.md`。

---

### Task 1: 共有スキーマと人数補正

**Files:** Create `packages/shared/src/schemas/template.ts`、`template.test.ts`。Modify `packages/shared/src/index.ts`。

**Interfaces — Produces:**
- `templateCategorySchema`(上記6値)、`templateListTypeSchema`(= `listTypeSchema`)、`templateLanguageSchema`(`'ja'|'en'`)。
- `officialTemplateSchema`(`id, category, priority:int, published, listType, icon, adjustableByPeople, defaultPartySize:1..10, hasSafetyNotice, itemCount, ja, en`。`ja`/`en` は `{title, description, notice|null}`)、`officialTemplateItemSchema`(`id, sortOrder, quantity|null, perPerson, ja, en`。`ja`/`en` は `{name, unit|null, category|null, note|null}`)、`officialTemplateFileSchema`(= テンプレート + `items: OfficialTemplateItem[]`(1件以上)。`id` 重複なし。`hasSafetyNotice` なら `ja.notice`・`en.notice` が非null。`adjustableByPeople` なら `perPerson` の項目が1つ以上。`itemCount == items.length`)。
- `myTemplateItemSchema`(`id, name, quantity|null, unit|null, category|null, note|null, checked`)、`myTemplateSchema`(`id, title, description|null, listType, icon, color, itemCount, items, createdAt, updatedAt`)。
- `saveMyTemplateRequestSchema`(`listId, title, description|null, requestId`)、`saveMyTemplateResponseSchema`(`templateId`)。
- `createListFromTemplateRequestSchema`(`source:'official'|'my', templateId, itemIds:string[](最大500), partySize?:int 1..10, language, requestId`)、`createListFromTemplateResponseSchema`(`listId`)。
- `scaleQuantity(item: { quantity: number | null; perPerson: boolean }, partySize: number): number | null`。

- [ ] **Step 1: Write the failing tests**(`template.test.ts`): ①正しいファイルが通る。②カテゴリ違い・`itemCount` 不一致・`hasSafetyNotice` で注意なし・`adjustableByPeople` で `perPerson` なし・項目ID重複は失敗。③`scaleQuantity({quantity:2,perPerson:true},4) === 8`、`perPerson:false` は元の数量、`quantity:null` は `null`。④`createListFromTemplateRequestSchema` は `partySize: 0` と `11` を拒否。
- [ ] **Step 2: Run** `pnpm --filter @soroe/shared exec vitest run template` → FAIL。
- [ ] **Step 3: Implement** 上記を `template.ts` に実装し、`index.ts` から再エクスポートする。
- [ ] **Step 4: Run** 同コマンド + `pnpm run build:shared` → PASS。
- [ ] **Step 5: Commit** `git commit -m "テンプレートの共有スキーマと人数補正を追加する"`

### Task 2: 公式テンプレート10件と validate / seed

**Files:** Create `functions/data/official-templates/<id>.json` ×10、`functions/scripts/official-templates.mjs`、`functions/src/templates/officialTemplates.data.test.ts`。Modify `functions/package.json`(`templates:validate` / `templates:seed`)、ルート `package.json`(同名のエイリアス)。

**Interfaces:** Consumes: `officialTemplateFileSchema`(Task 1)。Produces: コマンド `pnpm run templates:validate`(全JSONを検証。失敗は非0)、`pnpm run templates:seed`(Emulator へ投入。`FIRESTORE_EMULATOR_HOST` が無ければ本番へ誤投入しないよう即終了)。Firestore へは `officialTemplates/{id}`(`items` を除く本体)と `officialTemplates/{id}/items/{itemId}` を書き、再実行しても結果が同じ(冪等。同じIDで上書き)。

テンプレート10件(`id`・カテゴリ・種別): `weekly-groceries`(shopping・shopping・人数補正)、`household-restock`(shopping・shopping)、`overnight-trip-kids`(family-trip・packing・人数補正)、`hometown-visit`(family-trip・packing)、`park-picnic`(outing・packing・人数補正)、`day-hike`(outdoor・packing・安全注意)、`camping`(outdoor・packing・人数補正)、`school-excursion`(school・packing)、`disaster-kit`(home・packing・安全注意・人数補正)、`moving-checklist`(home・task)。各10〜15項目。日英の文言は私が下書きし、PR で一覧を見せて確認してもらう。

- [ ] **Step 1: Write the failing test**(`officialTemplates.data.test.ts`): `data/official-templates/*.json` が10件あり、全てが `officialTemplateFileSchema` を通り、`id` が重複せず、ファイル名が `id` と一致し、全テンプレートの全項目に `ja`/`en` の `name` がある。安全注意が必要な `day-hike` と `disaster-kit` は `hasSafetyNotice: true`。
- [ ] **Step 2: Run** `pnpm --filter functions exec vitest run officialTemplates` → FAIL(ファイルなし)。
- [ ] **Step 3: Write** 10件のJSONと `official-templates.mjs`(`validate` / `seed` のサブコマンド)を作る。
- [ ] **Step 4: Run** 同テスト → PASS。さらに `firebase emulators:exec --only firestore 'pnpm run templates:seed'` を2回実行し、どちらも成功する(冪等)ことを確認する。
- [ ] **Step 5: Commit** `git commit -m "公式テンプレート10件(日英)とvalidate/seedコマンドを追加する"`

### Task 3: Firestore Rules

**Files:** Modify `firestore.rules`、`functions/src/rules/firestore.rules.test.ts`。

**Interfaces:** Produces(Rules の振る舞い): `officialTemplates/{id}` と `items`: サインイン済みは `published == true` のものだけ読める(`items` は親が公開のときだけ)、書込は全拒否。`users/{uid}/myTemplates/{id}`: 本人のみ read / delete。create は拒否。update は本人のみで、変更できるキーは `title`・`description`・`items`・`itemCount`・`updatedAt` だけ、`title` は1〜60文字、`items` の件数は増えず(`request.resource.data.items.size() <= resource.data.items.size()`)、`itemCount == items.size()`。

- [ ] **Step 1: Write the failing tests**: 未認証は公式を読めない。サインイン済みは公開の公式を読める / `published:false` は読めない / 書けない。自分のマイテンプレートを読める・他人のは読めない・作成できない。`title` と `items`(減らす)の更新は通り、`items` を増やす更新・`listType` の変更・他人の更新は拒否。削除は本人のみ。
- [ ] **Step 2: Run** `pnpm --filter functions run test:rules` → 追加分が FAIL。
- [ ] **Step 3: Implement** Rules を追加する。
- [ ] **Step 4: Run** 同コマンド → 全て PASS。
- [ ] **Step 5: Commit** `git commit -m "テンプレートのFirestore Rulesを追加する"`

### Task 4: Cloud Functions(保存・作成)

**Files:** Create `functions/src/templates/{templateStore.ts,saveMyTemplate.ts,createListFromTemplate.ts}` と各テスト、`functions/src/integration/templateStore.integration.test.ts`。Modify `functions/src/index.ts`、`functions/package.json`(統合テストの実行対象は既存の `src/integration` に含まれる)。

**Interfaces:**
- Consumes: `getPlan`、`getDisplayName`、`FIRESTORE_BATCH_CHUNK_SIZE`、`isUnderActiveListLimit`、Task 1 のスキーマと `scaleQuantity`。
- Produces:
  - `saveMyTemplateTransaction(uid, requestId, listId, fields: {title: string; description: string | null}, plan: Plan): Promise<{status:'saved'|'reused'; templateId} | {status:'not-found'} | {status:'empty'} | {status:'limit-reached'}>` — 呼び出し元がリストのメンバーでなければ `not-found`。削除済みも `not-found`。項目0件は `empty`。Free で既に1件なら `limit-reached`。担当者・作成者・完了者・履歴は保存しない。`checked = completedAt != null`。
  - `createListFromTemplateTransaction(uid, requestId, input: {source; templateId; itemIds; partySize?; language}, plan, displayName): Promise<{status:'created'|'reused'; listId} | {status:'not-found'} | {status:'invalid-items'} | {status:'limit-reached'}>` — 公式は `published` のみ。`itemIds` に無いIDがあれば `invalid-items`(何も作らない)。リストは `createListTransaction` と同じ形(owner メンバー、listRef、`requestId` の記録)。項目は 400件ずつ batch。公式は `perPerson` の数量を `scaleQuantity` で補正(`adjustableByPeople` のときだけ。`partySize` 省略時は `defaultPartySize`)。マイの `checked` は完了状態(`completedAt` と `completedBy: uid`)として作る。リスト名は `language` の `title`(公式)/ `title`(マイ)を60文字まで。
  - `saveMyTemplate` / `createListFromTemplate`(onCall)。`not-found`→`HttpsError('not-found')`、`empty`/`invalid-items`→`invalid-argument`、`limit-reached`→`resource-exhausted`(文言: マイテンプレートは `Freeプランで保存できるマイテンプレートは1件までです`、リストは既存の `Freeプランで作成できるリストは3件までです`)。

- [ ] **Step 1: Write the failing tests**
  - 統合(Emulator): 保存→`users/{uid}/myTemplates/{id}` に `items` が入り、担当者・作成者・完了者が無い。Free の2件目は `limit-reached`、Premium(`entitlements/{uid}.plan = 'premium'`)は通る。同じ `requestId` の再送は `reused` で件数が増えない(Review Focus 1)。空のリストは `empty`(同 5)。メンバーでない/削除済みは `not-found`。
  - 保存後に元リストの項目を変更・削除しても、保存済みの `items` は不変(同 6)。
  - 作成(公式): 選んだ項目だけでリストができ、人数補正が `perPerson` の項目だけに掛かる(`quantity:null` は null のまま、同 4)。`published:false` は `not-found`(同 3)。存在しない `itemIds` は `invalid-items` でリストが作られない(同 2)。アクティブ3件のとき `limit-reached`。同じ `requestId` の再送は `reused` でリストが増えない。500項目超でも作成できる(chunk)。
  - 作成(マイ): `checked: true` の項目が完了状態で作られる。他人のテンプレートは `not-found`。
  - handler 単体: スキーマ違反は `invalid-argument`。
- [ ] **Step 2: Run** `pnpm --filter functions run test:rules` と `pnpm --filter functions test` → FAIL。
- [ ] **Step 3: Implement** store(transaction 内で上限・冪等を判定し、項目だけ transaction の外で batch)と、2つの Callable。`index.ts` で export。
- [ ] **Step 4: Run** 同コマンド + `pnpm run build:functions` → PASS。
- [ ] **Step 5: Commit** `git commit -m "テンプレートの保存・リスト作成のCloud Functionsを追加する"`

### Task 5: モバイルのデータ層と純粋関数

**Files:** Create `apps/mobile/src/features/templates/{TemplateRepository.ts,TemplateRepository.web.ts,TemplateCallables.ts,converters.ts,templateText.ts,templateSelection.ts}` と `__tests__/`。

**Interfaces:**
- Produces:
  - `subscribeToOfficialTemplates(onChange: (templates: OfficialTemplate[]) => void, onError): () => void`(`published == true`、`priority` 昇順)。`subscribeToOfficialTemplateItems(templateId, onChange: (items: OfficialTemplateItem[]) => void, onError): () => void`(`sortOrder` 昇順)。`subscribeToMyTemplates(uid, onChange: (templates: MyTemplate[]) => void, onError): () => void`。`subscribeToMyTemplate(uid, templateId, onChange: (t: MyTemplate | null) => void, onError)`。native は RN Firebase、web は完全版SDK(`typeof Native.xxx`)。
  - 書込(オフライン可、client write): `renameMyTemplate(uid, templateId, fields: {title: string; description: string | null}): void`、`removeMyTemplateItems(uid, templateId, remainingItems: MyTemplateItem[]): void`(`items` と `itemCount` と `updatedAt` を更新)、`deleteMyTemplate(uid, templateId): void`。
  - Callable: `saveMyTemplate(request): Promise<SaveMyTemplateResponse>`、`createListFromTemplate(request): Promise<CreateListFromTemplateResponse>`(応答をスキーマで検証)。
  - `localizeTemplate(template: OfficialTemplate, language): {title; description; notice: string | null}`、`localizeItem(item: OfficialTemplateItem, language): {name; unit; category; note}`。
  - `initialSelection(itemIds: string[]): Set<string>`(全選択)、`toggleSelection(selected: Set<string>, id: string): Set<string>`。
  - `describeTemplateError(error: unknown): string` — `resource-exhausted` は上限の文言、`not-found`、通信不可などを日本語で返す(既存の `describeListActionError` に倣う)。

- [ ] **Step 1: Write the failing tests**: `localizeTemplate`/`localizeItem` が言語で `ja`/`en` を選ぶ。`initialSelection` が全選択、`toggleSelection` が追加/除去(元の Set を変更しない)。`describeTemplateError` が `resource-exhausted` で上限の文言(マイテンプレートの保存と、リスト作成で別の文言になるよう `context: 'save' | 'create'` を受け取る)。converters が Firestore のデータを共有スキーマの型へ変換する(Timestamp は `toMillis()` の duck typing)。
- [ ] **Step 2: Run** `pnpm --filter mobile exec jest src/features/templates` → FAIL。
- [ ] **Step 3: Implement**。web 版は `webFirestore()`(既存)を使う。
- [ ] **Step 4: Run** 同コマンド + `pnpm run typecheck` → PASS。
- [ ] **Step 5: Commit** `git commit -m "テンプレートのデータ層と純粋関数を追加する"`

### Task 6: テンプレートタブと詳細(公式・マイの作成)

**Files:** Modify `apps/mobile/src/app/(app)/templates.tsx`、`apps/mobile/src/app/_layout.tsx`(`template-detail` を登録)。Create `apps/mobile/src/app/template-detail.tsx`、`apps/mobile/src/features/templates/__tests__/screens/{TemplatesScreen,TemplateDetailScreen}.test.tsx`。

**Interfaces:** Consumes: Task 5 の購読・`createListFromTemplate`・純粋関数、`useConnectivity`、`useSession().profile.language`。Produces: ルート `/template-detail?source=official|my&templateId=<id>`。

- [ ] **Step 1: Write the failing tests**
  - タブ: 「公式」「マイ」の切替。公式は `TemplateCard`(名称・説明・件数)を優先度順に出し、タップで `/template-detail?source=official&templateId=…` へ。言語が `en` なら英語の名称。マイが空なら「保存したテンプレートはありません」。
  - 詳細: 全項目が選択済みで表示され、外すと選択数が減る。人数補正のあるテンプレートは人数(1〜10)を変えると `perPerson` の項目の数量表示が変わる。`hasSafetyNotice` なら、作成前に注意ダイアログが出て、「作成する」を選ぶまで Callable を呼ばない。「リストを作成」で `createListFromTemplate` が `{source, templateId, itemIds(選択分), partySize, language, requestId}` で呼ばれ、成功したら作成したリストへ遷移する。`resource-exhausted` はリスト上限の文言を表示。オフラインでは作成ボタンが無効で理由を表示。
- [ ] **Step 2: Run** `pnpm --filter mobile exec jest src/features/templates/__tests__/screens` → FAIL。
- [ ] **Step 3: Implement** 公式・マイ共通の詳細(`source` で読み先を変える。マイは選択でなく項目の削除は Task 7)。既存の `Chip`/`Button`/`Banner`/`TemplateCard` を使う。
- [ ] **Step 4: Run** 同コマンド + `pnpm run lint && pnpm run typecheck` → PASS。
- [ ] **Step 5: Commit** `git commit -m "テンプレートタブと詳細(公式から作成)を実装する"`

### Task 7: マイテンプレートの保存・管理

**Files:** Create `apps/mobile/src/app/save-template.tsx`、`__tests__/screens/{SaveTemplateScreen,MyTemplateManage}.test.tsx`。Modify `apps/mobile/src/app/list/[listId].tsx`(メニュー)、`template-detail.tsx`(マイの管理)、`_layout.tsx`、`ListDetailScreen.test.tsx`。

**Interfaces:** Consumes: Task 5 の `saveMyTemplate` / `renameMyTemplate` / `removeMyTemplateItems` / `deleteMyTemplate`、`describeTemplateError`。Produces: ルート `/save-template?listId=<id>`。リスト詳細のメニューに「マイテンプレートに保存」。

- [ ] **Step 1: Write the failing tests**
  - リスト詳細のメニューに「マイテンプレートに保存」があり、選ぶと `/save-template?listId=…` を開く(アーカイブ中は読み取り専用でも保存できる=メニューに出す)。オフラインでは押せず理由を出す。
  - 保存画面: タイトル(初期値はリスト名)と説明を入れて保存すると `saveMyTemplate` が呼ばれ、成功でテンプレート一覧へ。`resource-exhausted` では上限の画面(「既存のテンプレートを確認する」「後で」)を出す。タイトルが空は保存できない。
  - マイ詳細: 名前・説明の変更で `renameMyTemplate`、項目を外して保存すると `removeMyTemplateItems`(残す項目だけを渡す)、削除は確認ダイアログのあとに `deleteMyTemplate` を呼んで一覧へ戻る。
- [ ] **Step 2: Run** `pnpm --filter mobile exec jest` → FAIL。
- [ ] **Step 3: Implement**。
- [ ] **Step 4: Run** `pnpm run lint && pnpm run typecheck && pnpm --filter mobile exec jest` → PASS。
- [ ] **Step 5: Commit** `git commit -m "マイテンプレートの保存・管理を実装する"`

### Task 8: AC-04 通しテスト・CI・記録

**Files:** Create `apps/mobile/scripts/e2e-templates-ac04.mjs`、`docs/tmpl-004-ac04.md`。Modify `apps/mobile/package.json`(`e2e:templates`)、`.github/workflows/ci.yml`、`docs/soroe-functional-specification.md`(必要な追記)、`docs/local-dev-containers.md`(シーダーが公式テンプレートも入れる旨)、`functions/scripts/seed-emulator.mjs`(公式テンプレートの投入)。

**Interfaces:** `e2e-share-ac01.mjs` と同じ作法(`createClient` / `signUp` / `step`、`runWithRetry`)。公式テンプレートはスクリプトの冒頭で `validate`/`seed` 相当を Admin SDK で入れる(または統合前に `templates:seed`)。

- [ ] **Step 1: Write the script**(`step` で通す): ①公式テンプレートを不要項目を除いてリスト化できる(選んだ項目だけ入る)。②リストをマイテンプレートに保存できる(担当者・作成者・完了者が無い)。③Free の2件目の保存は `resource-exhausted`。④保存後に元リストの項目を変更・削除しても、保存済みの内容は変わらない。⑤マイテンプレートからリストを作れる。⑥元の公式テンプレートを変更(Admin で項目名を書き換え)しても、作成済みのリストは変わらない。
- [ ] **Step 2: Run** `firebase emulators:exec --only auth,firestore,functions 'pnpm run templates:seed && pnpm --filter mobile run e2e:templates'`(Java は `PATH=/opt/homebrew/opt/openjdk/bin:$PATH`)→ 全 ✓。
- [ ] **Step 3: CI** に追加し、`seed-emulator.mjs` で公式テンプレートも入れるようにし、手順書を更新する。
- [ ] **Step 4: Record** `docs/tmpl-004-ac04.md`(結果・未実施の範囲・公式テンプレート10件の一覧)。
- [ ] **Step 5: Verify & Commit** `pnpm run ci` → 通過。`git commit -m "AC-04の通しテストを追加し、結果を記録する"`

---

## Self-Review

- **Spec coverage:** 4.1 → Task 1・2、4.2 → Task 3、4.3 → Task 4、4.4 → Task 5〜7、4.5 → 各タスクのテストと Task 8。非ゴールのタスクなし。
- **Type consistency:** スキーマ名は Task 1 で定義し、Task 4〜7 が使う。`createListFromTemplate` の入出力は Task 1・4・5・6 で同じ。Repository の関数名は Task 5 の Interfaces に固定。
- **Review Focus:** 6件すべてに所有タスクのテストがある。
