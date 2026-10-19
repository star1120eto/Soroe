# EPIC-05 オフライン・同期・競合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** オフライン状態と未同期件数を見せ、オンライン必須の操作を理由つきで止め、項目編集の競合を項目単位で扱い、AC-03 をEmulatorの自動テストで保証する。

**Architecture:** 接続状態は `users/{uid}` の購読(`includeMetadataChanges`)の `fromCache` から3秒の遅延つきで判定する(`ConnectivityProvider`)。競合判定は純粋関数(`itemConflict.ts`)に切り出し、項目編集画面は「変えた項目だけ保存」「重なった項目だけ比較確認」「削除済みなら新規追加へ誘導」の3経路を持つ。通しテストは実際のFirestore SDKで `disableNetwork()` により機内モードを再現する。

**Tech Stack:** React Native Firebase(native)/ firebase JS SDK(web、`*.web.ts`)、Jest + @testing-library/react-native、Firebase Emulator、Node(`.mjs`の通しスクリプト)。

**Spec:** `docs/superpowers/specs/2026-10-19-epic-05-offline-design.md`(機能仕様書 12章 OFFLINE-01 / SYNC-01、AC-03、ITEM-01)。

## Global Constraints

- ネイティブ依存を追加しない(NetInfo等。開発ビルドの作り直しが要るため)。
- Firestore Rules・Cloud Functions は変更しない。
- 接続状態の判定: `fromCache` が **3秒** 続いたときだけオフライン(`useDelayedFlag(flag, 3000)`)。
- 未同期の件数は、リスト詳細の項目スナップショットで `doc.metadata.hasPendingWrites` が true の項目の数。一覧画面は帯のみ。
- オンライン必須の理由文言(固定): `オフラインのため使えません。オンライン接続が必要です`
- オフライン帯の文言(固定): `オフラインです。変更は端末に保存され、復帰後に自動で同期します`
- 比較ダイアログの選択肢は従来どおり `相手の変更を使う` / `自分の変更で上書き`。
- 実装は `*.web.ts` を持つ Repository の両方(native と web)で同じシグネチャにする(`typeof Native.xxx`)。
- CLAUDE.md: 作業後は PR を作り、CI 通過後に `code-review` でセルフレビューする。

## Review Focus

1. 起動直後(最初のサーバー応答前)に `fromCache` が true でも、3秒未満なら「オフライン」を出さない → Task 3 のテスト。
2. 何も変えずに保存したとき、書き込みを1件も発行せず画面を閉じる → Task 1 / 6 のテスト。
3. 2人が同じ項目を**同じ値**へ変えた場合は競合扱いにしない → Task 1 のテスト。
4. 編集中に項目が削除されたとき、保存を止めて入力内容を新規追加へ誘導する → Task 1 / 6 のテスト。
5. 再試行ボタンの連打で `disableNetwork`/`enableNetwork` が重ならない(実行中は無視) → Task 3 のテスト。

## File Structure

- Create `apps/mobile/src/features/lists/itemConflict.ts` — 項目編集の競合判定(純粋関数)。
- Create `apps/mobile/src/features/connectivity/ConnectivityProvider.tsx` — 接続状態の Provider と `useConnectivity()`。
- Create `apps/mobile/src/features/connectivity/OfflineBanner.tsx` — 帯の表示。
- Create `apps/mobile/src/features/connectivity/offlineMessages.ts` — 固定文言。
- Create `apps/mobile/src/features/connectivity/SyncStateRepository.ts` / `SyncStateRepository.web.ts` — `users/{uid}` の同期状態購読と再接続(RN Firebase のweb実装は購読できないため、webは完全版SDK)。
- Modify `apps/mobile/src/features/lists/ListRepository.ts` / `.web.ts` — `ListItemsSnapshot.pendingCount`。
- Modify `apps/mobile/src/app/_layout.tsx`、`(app)/index.tsx`、`list/[listId].tsx`、`list-share.tsx`、`new-list.tsx`、`item-edit.tsx`。
- Create `apps/mobile/scripts/e2e-offline-ac03.mjs`、`docs/offline-005-ac03.md`。Modify `apps/mobile/package.json`、`.github/workflows/ci.yml`。

---

### Task 1: 項目編集の競合判定(純粋関数)

**Files:**
- Create: `apps/mobile/src/features/lists/itemConflict.ts`
- Test: `apps/mobile/src/features/lists/__tests__/itemConflict.test.ts`

**Interfaces:**
- Produces:
  - `type EditableField = 'name' | 'quantity' | 'unit' | 'category' | 'note' | 'assigneeId' | 'dueAt' | 'completed'`
  - `type EditableValues = Pick<ListItem, 'name' | 'quantity' | 'unit' | 'category' | 'note' | 'assigneeId' | 'dueAt'> & { completed: boolean }`
  - `toEditableValues(item: ListItem): EditableValues`(`completed = item.completedAt !== null`)
  - `changedFields(base: EditableValues, next: EditableValues): EditableField[]`
  - `analyzeConflict(base: EditableValues, mine: EditableValues, latest: EditableValues): { remoteChanged: EditableField[]; overlapping: EditableField[] }` — `overlapping` は、自分とリモートの**両方**が基準から変え、かつ結果の値が**異なる**項目。
  - `resolveSave(args: { base: EditableValues; mine: EditableValues; latest: ListItem | null }): { action: 'noop' } | { action: 'deleted' } | { action: 'save'; fields: EditableField[] } | { action: 'confirm'; fields: EditableField[]; overlapping: EditableField[] }` — `latest === null`(削除済み)→ `deleted`。自分の変更が無い → `noop`。重なり無し → `save`(自分が変えた項目のみ)。重なり有り → `confirm`。
  - `formatConflictMessage(overlapping: EditableField[], mine: EditableValues, latest: EditableValues): string` — 重なった項目ごとに1行 `項目名: あなた「A」/相手「B」`(ラベルは日本語: 項目名・数量・単位・カテゴリ・メモ・担当者・期限・完了。未設定は `なし`)。

- [ ] **Step 1: Write the failing tests**(`itemConflict.test.ts`)
  - `changedFields` は変えた項目だけを返す(例: `name` のみ変更 → `['name']`)。
  - `analyzeConflict`: 自分=`note`、相手=`name` → `overlapping=[]`、`remoteChanged=['name']`。
  - 自分=`name:'B'`、相手=`name:'C'` → `overlapping=['name']`。
  - 自分=`name:'B'`、相手=`name:'B'`(同じ値) → `overlapping=[]`(Review Focus 3)。
  - `resolveSave`: 変更なし → `noop`(Review Focus 2)。`latest:null` → `deleted`(Review Focus 4)。重なり無し → `save` と `fields`。重なり有り → `confirm`。
  - `formatConflictMessage`: `name` の重なり → `項目名: あなた「B」/相手「C」`、未設定は `なし`。
- [ ] **Step 2: Run** `pnpm --filter mobile exec jest src/features/lists/__tests__/itemConflict.test.ts` → FAIL(未定義)。
- [ ] **Step 3: Implement** 上記シグネチャを `itemConflict.ts` に実装する。値の比較は `===`(`quantity`/`dueAt` は数値|null、他は文字列|null|boolean)。
- [ ] **Step 4: Run** 同コマンド → PASS。
- [ ] **Step 5: Commit** `git add apps/mobile/src/features/lists && git commit -m "項目編集の競合判定を純粋関数に切り出す"`

### Task 2: リポジトリ層(同期状態の購読・再接続・未同期件数)

**Files:**
- Create: `apps/mobile/src/features/connectivity/SyncStateRepository.ts`(native)、`SyncStateRepository.web.ts`(web、`webFirestore()` を使う)
- Modify: `apps/mobile/src/features/lists/ListRepository.ts`、`ListRepository.web.ts`

**Interfaces:**
- Produces(`SyncStateRepository` の native と web で同じシグネチャ。web は `typeof Native.xxx` で型を揃える):
  - `subscribeToSyncState(uid: string, onChange: (state: { fromCache: boolean }) => void, onError: (e: Error) => void): () => void` — `users/{uid}` を `includeMetadataChanges` つきで購読し `snapshot.metadata.fromCache` を渡す。
  - `reconnect(): Promise<void>` — Firestore の `disableNetwork()` → `enableNetwork()`。
- `ListItemsSnapshot` に `pendingCount: number` を追加(`docs.filter(d => d.metadata.hasPendingWrites).length`)。native と web の `subscribeToListItems` の両方。

- [ ] **Step 1:** 既存の `converters.test.ts` / 画面テストが `pendingCount` 追加後も通ることを確認するため、`ListDetailScreen.test.tsx` の `arrange` が返す `onChange` に `pendingCount: 0` を足す(型エラーが出ることを確認 = 失敗)。
- [ ] **Step 2: Implement** 上記3つを native と web に実装する。`reconnect` は多重実行を考慮しない(ガードは Task 3)。
- [ ] **Step 3: Run** `pnpm run typecheck && pnpm --filter mobile exec jest src/features/lists` → PASS。
- [ ] **Step 4: Commit** `git commit -m "同期状態の購読・再接続・未同期件数をRepositoryに追加する"`

### Task 3: ConnectivityProvider と OfflineBanner

**Files:**
- Create: `apps/mobile/src/features/connectivity/{ConnectivityProvider.tsx,OfflineBanner.tsx,offlineMessages.ts}`
- Modify: `apps/mobile/src/app/_layout.tsx`
- Test: `apps/mobile/src/features/connectivity/__tests__/ConnectivityProvider.test.tsx`、`OfflineBanner.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `subscribeToSyncState` / `reconnect`(`SyncStateRepository`)、`useSession()`(`profile?.uid`)、`useDelayedFlag`。
- Produces:
  - `ConnectivityProvider({ children })` — `profile` が無い間は購読しない。`fromCache` を `useDelayedFlag(fromCache, 3000)` に通して `isOffline` を作る。ログアウトで購読を解除。
  - `useConnectivity(): { isOffline: boolean; isRetrying: boolean; retry: () => Promise<void> }` — `retry` は実行中なら何もしない(Review Focus 5)。
  - `OfflineBanner({ isOffline: boolean; pendingCount: number; onRetry: () => void; isRetrying: boolean })` — オフライン: 固定文言 + 再試行ボタン(件数があれば `未同期 N件`)。オンラインで `pendingCount>0`: `同期中です(N件)`。両方なし: 何も描画しない。
  - `OFFLINE_BANNER_MESSAGE`、`OFFLINE_REQUIRED_MESSAGE`(`offlineMessages.ts`、固定文言)。

- [ ] **Step 1: Write the failing tests**
  - Provider: `fromCache:true` を通知して2999ms では `isOffline=false`、3000ms で `true`(fake timers)。`fromCache:false` で即 `false`。
  - `retry()` を連打しても `reconnect` は1回(最初の呼び出しが終わるまで)。
  - `profile` なしでは `subscribeToSyncState` を呼ばない。アンマウントで購読解除。
  - Banner: オフライン時に固定文言と「再試行」を描画し、押すと `onRetry`。`pendingCount=0` かつオンラインは何も描画しない。
- [ ] **Step 2: Run** `pnpm --filter mobile exec jest src/features/connectivity` → FAIL。
- [ ] **Step 3: Implement** Provider / `useConnectivity` / Banner(既存 `Banner` と `Button` を使う)。`_layout.tsx` では `SessionProvider` の内側に `ConnectivityProvider` を置く。
- [ ] **Step 4: Run** 同コマンド → PASS。
- [ ] **Step 5: Commit** `git commit -m "接続状態のProviderとオフライン帯を追加する"`

### Task 4: 画面へ帯を表示する(リスト詳細・一覧)

**Files:**
- Modify: `apps/mobile/src/app/list/[listId].tsx`、`apps/mobile/src/app/(app)/index.tsx`
- Test: `apps/mobile/src/features/lists/__tests__/screens/ListDetailScreen.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `useConnectivity` / `OfflineBanner`、Task 2 の `pendingCount`。

- [ ] **Step 1: Write the failing tests**(`ListDetailScreen.test.tsx`、`useConnectivity` をモック)
  - オフラインで `pendingCount=2` → 「オフラインです…」と `未同期 2件` を表示。
  - オンラインで `pendingCount=0` → 帯なし(既存の `hasPendingWrites` 1秒遅延の帯は置き換える。`useDelayedFlag` は「同期中」帯にだけ使う)。
- [ ] **Step 2: Run** → FAIL。
- [ ] **Step 3: Implement** リスト詳細の既存「未同期の変更があります」を `OfflineBanner` に置き換える。一覧(`(app)/index.tsx`)の上部に `OfflineBanner`(`pendingCount={0}`)を出す。
- [ ] **Step 4: Run** `pnpm --filter mobile exec jest src/features/lists` → PASS。
- [ ] **Step 5: Commit** `git commit -m "リスト詳細・一覧にオフライン帯を表示する"`

### Task 5: オンライン必須の操作を止める

**Files:**
- Modify: `apps/mobile/src/app/list-share.tsx`、`apps/mobile/src/app/list/[listId].tsx`(メニュー)、`apps/mobile/src/app/new-list.tsx`(作成のみ)、`apps/mobile/src/app/new-list-method.tsx`
- Test: `apps/mobile/src/features/sharing/__tests__/screens/ListShareScreen.test.tsx`、`ListDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `useConnectivity().isOffline`、`OFFLINE_REQUIRED_MESSAGE`。

- [ ] **Step 1: Write the failing tests**
  - 共有画面: オフラインで「招待リンクを発行して共有」「リンクNを取消」「管理」「リストから退出」が無効、`OFFLINE_REQUIRED_MESSAGE` を表示。オンラインなら従来どおり。
  - リスト詳細メニュー: オフラインで「複製する」「アーカイブする」「削除する」を選ぶと `Alert` で理由を出し、Callable を呼ばない。「リストを編集」「共有・メンバー」は従来どおり開く。
- [ ] **Step 2: Run** → FAIL。
- [ ] **Step 3: Implement** 無効化は画面側の事前判定のみ。`new-list.tsx` は作成ボタンだけ(編集は対象外=オフライン可)。
- [ ] **Step 4: Run** `pnpm --filter mobile exec jest` → PASS。
- [ ] **Step 5: Commit** `git commit -m "オフライン時にオンライン必須の操作を理由つきで止める"`

### Task 6: 項目編集 — 項目単位の保存・競合比較・削除優先

**Files:**
- Modify: `apps/mobile/src/app/item-edit.tsx`
- Modify: `apps/mobile/src/features/lists/itemEditForm.ts`(必要なら `EditableValues` への変換を追加)
- Test: `apps/mobile/src/features/lists/__tests__/screens/ItemEditScreen.test.tsx`(新規)

**Interfaces:**
- Consumes: Task 1 の `toEditableValues` / `resolveSave` / `formatConflictMessage`、既存の `validateItemEditForm`、`updateListItem`、`setListItemCompletion`、`addListItem`。

- [ ] **Step 1: Write the failing tests**(`ItemEditScreen.test.tsx`。expo-router・Repository・Alert をモック)
  - 何も変えず「保存する」→ `updateListItem` / `setListItemCompletion` を呼ばず `router.back()`。
  - メモだけ変更して保存(他のメンバーは名前だけ変更済み)→ 確認なしで保存し、`updateListItem` に渡る入力は `note` のみ。
  - 同じ項目名を双方が別の値に変更 → `Alert` に `formatConflictMessage` の文言と「相手の変更を使う」「自分の変更で上書き」。「自分の変更で上書き」で `updateListItem` が呼ばれる。
  - 編集中に項目が削除された(購読が `null`)→ 「この項目は削除されました」と「入力内容を新しい項目として追加」を表示し、保存ボタンは出さない。追加ボタンで `addListItem` が入力内容で呼ばれる(Review Focus 4)。
- [ ] **Step 2: Run** `pnpm --filter mobile exec jest src/features/lists/__tests__/screens/ItemEditScreen.test.tsx` → FAIL。
- [ ] **Step 3: Implement** `handleSave` を `resolveSave` の4経路に置き換える。保存は `fields` に含まれる項目だけを `UpdateListItemInput` に詰める(`completed` は `setListItemCompletion` へ)。削除検知は、初期化済み(`initializedRef`)で購読が `null` を返した場合。基準(`base`)は編集開始時の `toEditableValues(item)`。「相手の変更を使う」を選んだら基準と入力を最新へ更新する。
- [ ] **Step 4: Run** `pnpm --filter mobile exec jest` → PASS。
- [ ] **Step 5: Commit** `git commit -m "項目編集を項目単位の保存にし、競合比較と削除優先を実装する"`

### Task 7: Emulator通しテスト(AC-03)・CI・記録

**Files:**
- Create: `apps/mobile/scripts/e2e-offline-ac03.mjs`、`docs/offline-005-ac03.md`
- Modify: `apps/mobile/package.json`(`"e2e:offline": "node scripts/e2e-offline-ac03.mjs"`)、`.github/workflows/ci.yml`、`docs/soroe-functional-specification.md`(SYNC-01 に「重なった項目だけ比較確認」を追記)

**Interfaces:**
- 既存の `e2e-share-ac01.mjs` と同じ作法(`createClient` / `signUp` / `step` / `waitFor`)に合わせる。Callable `createList` でリストを作り、`disableNetwork(db)` / `enableNetwork(db)` で機内モードを再現する。

- [ ] **Step 1: Write the script** 次の手順を `step` で通す(失敗時は非0で終了):
  1. オフラインで追加・編集・完了・論理削除 → ローカルの購読へ即時に反映され、`metadata.hasPendingWrites === true`。
  2. 復帰 → `hasPendingWrites === false`、別クライアントの購読へ届く。
  3. 2クライアントがオフラインで**別の項目**を同時に変更 → 復帰後に両方残る。
  4. 同じ項目の**別フィールド**(`note` と `category`)を同時に変更 → 両方残る。同じフィールドは後着の値に収束。
  5. 一方が削除、他方が編集 → 復帰後、項目は `deletedAt` を持ち一覧に出ない(削除優先)。
- [ ] **Step 2: Run** `firebase emulators:exec --only auth,firestore,functions 'pnpm --filter mobile run e2e:offline'`(事前に `pnpm run build:shared && pnpm run build:functions`)→ 全ステップ ✓。
- [ ] **Step 3: CI** `ci.yml` の既存e2eの次に同じ形式で追加する(通信障害の再試行は既存の `runWithRetry` 方式に合わせる)。
- [ ] **Step 4: Record** `docs/offline-005-ac03.md` に結果、実機未実施、検知の遅れ(数秒)の注記を書く。
- [ ] **Step 5: Verify & Commit** `pnpm run ci` → 通過。`git commit -m "AC-03のEmulator通しテストを追加し、結果を記録する"`

---

## Self-Review

- **Spec coverage:** 4.1/4.2 → Task 2・3・4、4.3 → Task 5、4.4/4.5 → Task 1・6、4.6 → Task 7。非ゴールのタスクなし。
- **Type consistency:** `EditableValues`/`EditableField`/`resolveSave` は Task 1 で定義し Task 6 が使う。`pendingCount` は Task 2 で定義し Task 4 が使う。`useConnectivity` は Task 3 で定義し Task 4・5 が使う。
- **Review Focus:** 5件すべてに、所有タスクのテストがある。
