# LIST-002 リスト一覧・作成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/soroe-implementation-backlog.md` LIST-002 を実装する。リスト一覧(空状態含む)、作成方法選択、リスト作成/編集フォーム、そして新規作成をFree上限とrequestId冪等性を原子的に判定するCallable Function `createList` で実装する。

**Architecture:** リスト作成はFree上限判定が要るためCallable Functions(`createList`、Firestore transaction)。リスト編集(name/color/icon)は既存の`firestore.rules`がowner限定で直接client writeを許可しているためRules経由の直接書込みとし、denormalizeされた`users/{uid}/listRefs/{listId}`への反映は新規のFirestore trigger(`syncListRef`)がサーバー側で行う。モバイル側はExpo Routerの3画面(一覧・作成方法選択・作成/編集フォーム)を実装する。

**Tech Stack:** Firebase Cloud Functions v2 (Callable + Firestore trigger)、Firestore Admin SDK transaction、Zod (`@soroe/shared`)、Expo Router、React Native、Jest(mobile)/Vitest(functions/shared)。

## Global Constraints

- Freeプランのアクティブリスト上限は3件 (`docs/family-checklist-product-design.md` 4.1)。判定はサーバー側で原子的に行う。クライアント側の件数表示は目安であり権威ではない。
- リスト名は1〜60文字 (`packages/shared/src/schemas/list.ts` `listSchema.name`)。
- 種別は`shopping`/`packing`/`task`の3種のみ (`listTypeSchema`)。
- 書き込み系Callable APIは`requestId`必須、同一`uid + requestId`は同じ結果を返す (`docs/family-checklist-product-design.md` 12.2)。
- `lists/{listId}`の直接client作成は`firestore.rules`が拒否する(Free上限判定が要るため)。直接updateはownerのみ、`name`/`color`/`icon`/`updatedAt`のみ許可 (`firestore.rules` L37-44, `functions/src/rules/firestore.rules.test.ts` L112-136で検証済み)。
- `users/{uid}/listRefs/{listId}`はサーバーのみ書込可 (`firestore.rules` L28-31)。集計値の整合はサーバーが持つ。
- アイコン値は`apps/mobile/src/design-system/icons/ph-icon-paths.ts`にバンドルされた24種のみ描画できる(ランタイムIconify API非依存、UI-001)。
- 色トークンは`apps/mobile/src/design-system/tokens/colors.ts`の既存セマンティックトークンから選ぶ(新規HEX値を増やさない)。
- functions側のFirestore直叩きモジュール(store層)はこのリポジトリの既存慣習として単体テスト対象外(`functions/src/emailOtp/otpStore.ts`が前例)。オーケストレーション層(handler)はstore層をmockして単体テストする。UI画面(`app/`配下のroute component)も既存慣習として単体テスト対象外(`(auth)/email.tsx`等に前例なし)。最終タスクでFirebase Emulator + Web previewによる手動検証を行う。

---

## Task 1: 共有スキーマ — createList の入出力

**Files:**
- Modify: `packages/shared/src/schemas/list.ts`
- Test: `packages/shared/src/schemas/list.test.ts`

**Interfaces:**
- Produces: `createListRequestSchema`(zod)、`CreateListRequest`(type)、`createListResponseSchema`(zod)、`CreateListResponse`(type) — `@soroe/shared`から export。`CreateListRequest = CreateListInput & { requestId: string }`。`CreateListResponse = { listId: string }`。

- [ ] **Step 1: 失敗するテストを書く**

`packages/shared/src/schemas/list.test.ts` の末尾に追記:

```ts
describe("createListRequestSchema", () => {
  it("requires a non-empty requestId alongside the list fields", () => {
    const parsed = createListRequestSchema.parse({
      name: "今週の買い物",
      type: "shopping",
      color: "primary",
      icon: "shopping-cart-simple",
      requestId: "req-1",
    });
    expect(parsed.requestId).toBe("req-1");
    expect(parsed.name).toBe("今週の買い物");
  });

  it("rejects an empty requestId", () => {
    expect(() =>
      createListRequestSchema.parse({
        name: "今週の買い物",
        type: "shopping",
        color: "primary",
        icon: "shopping-cart-simple",
        requestId: "",
      })
    ).toThrow();
  });
});

describe("createListResponseSchema", () => {
  it("accepts a listId", () => {
    expect(() => createListResponseSchema.parse({ listId: "list-1" })).not.toThrow();
  });

  it("rejects an empty listId", () => {
    expect(() => createListResponseSchema.parse({ listId: "" })).toThrow();
  });
});
```

このファイル冒頭のimportに `createListRequestSchema, createListResponseSchema` を追加する:

```ts
import {
  createListInputSchema,
  createListItemInputSchema,
  createListRequestSchema,
  createListResponseSchema,
  listItemSchema,
  listSchema,
  userListRefSchema,
} from "./list";
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm --filter @soroe/shared run test`
Expected: FAIL — `createListRequestSchema is not exported` 相当のエラー。

- [ ] **Step 3: 最小実装を書く**

`packages/shared/src/schemas/list.ts` の末尾(`updateListItemInputSchema`の後)に追記:

```ts
// Callable Function `createList` の入出力(LIST-002)。requestIdは
// 同一uid+requestIdの再送を同じ結果にするための冪等性キー。
export const createListRequestSchema = createListInputSchema.extend({
  requestId: z.string().min(1),
});
export type CreateListRequest = z.infer<typeof createListRequestSchema>;

export const createListResponseSchema = z.object({
  listId: z.string().min(1),
});
export type CreateListResponse = z.infer<typeof createListResponseSchema>;
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm --filter @soroe/shared run test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/shared/src/schemas/list.ts packages/shared/src/schemas/list.test.ts
git commit -m "LIST-002: createList Callableの入出力スキーマを追加"
```

---

## Task 2: functions — Free上限の純粋判定ロジック

**Files:**
- Create: `functions/src/lists/constants.ts`
- Create: `functions/src/lists/listLimit.ts`
- Test: `functions/src/lists/listLimit.test.ts`

**Interfaces:**
- Produces: `FREE_ACTIVE_LIST_LIMIT: number`、`Plan = "free" | "premium"`(type)、`isUnderActiveListLimit(activeCount: number, plan: Plan): boolean`。Task 4/5で使用する。

- [ ] **Step 1: 失敗するテストを書く**

`functions/src/lists/listLimit.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { FREE_ACTIVE_LIST_LIMIT } from "./constants";
import { isUnderActiveListLimit } from "./listLimit";

describe("isUnderActiveListLimit", () => {
  it.each([0, 1, FREE_ACTIVE_LIST_LIMIT - 1])(
    "allows a free user with %i active lists",
    (count) => {
      expect(isUnderActiveListLimit(count, "free")).toBe(true);
    }
  );

  it.each([FREE_ACTIVE_LIST_LIMIT, FREE_ACTIVE_LIST_LIMIT + 1])(
    "rejects a free user with %i active lists",
    (count) => {
      expect(isUnderActiveListLimit(count, "free")).toBe(false);
    }
  );

  it("always allows a premium user", () => {
    expect(isUnderActiveListLimit(999, "premium")).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm --filter functions exec vitest run src/lists/listLimit.test.ts`
Expected: FAIL — `Cannot find module './constants'` 相当。

- [ ] **Step 3: 最小実装を書く**

`functions/src/lists/constants.ts`:

```ts
// docs/family-checklist-product-design.md 4.1: Freeはアクティブリスト合計3件。
export const FREE_ACTIVE_LIST_LIMIT = 3;
```

`functions/src/lists/listLimit.ts`:

```ts
import { FREE_ACTIVE_LIST_LIMIT } from "./constants";

export type Plan = "free" | "premium";

// 純粋関数: Firestoreに触れずテストできる(emailOtp/rateLimit.tsのcheckRateLimitに倣う)。
export function isUnderActiveListLimit(activeCount: number, plan: Plan): boolean {
  if (plan === "premium") {
    return true;
  }
  return activeCount < FREE_ACTIVE_LIST_LIMIT;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm --filter functions exec vitest run src/lists/listLimit.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/src/lists/constants.ts functions/src/lists/listLimit.ts functions/src/lists/listLimit.test.ts
git commit -m "LIST-002: Free上限判定の純粋関数を追加"
```

---

## Task 3: functions — Entitlement(プラン)取得

**Files:**
- Create: `functions/src/lists/entitlements.ts`
- Test: `functions/src/lists/entitlements.test.ts`

**Interfaces:**
- Consumes: `Plan`(Task 2の`./listLimit`から)。
- Produces: `getPlan(uid: string): Promise<Plan>`。Task 5で使用する。

- [ ] **Step 1: 失敗するテストを書く**

`functions/src/lists/entitlements.test.ts`:

```ts
import { getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPlan } from "./entitlements";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(),
}));

const mockGet = vi.fn();
const mockDoc = vi.fn().mockReturnValue({ get: mockGet });
const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });
const mockDb = { collection: mockCollection };

describe("getPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFirestore).mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestore>);
  });

  it("returns free when no entitlements document exists", async () => {
    mockGet.mockResolvedValue({ data: () => undefined });
    await expect(getPlan("uid-1")).resolves.toBe("free");
    expect(mockCollection).toHaveBeenCalledWith("entitlements");
    expect(mockDoc).toHaveBeenCalledWith("uid-1");
  });

  it("returns free when the document has no premium plan", async () => {
    mockGet.mockResolvedValue({ data: () => ({ plan: "free" }) });
    await expect(getPlan("uid-1")).resolves.toBe("free");
  });

  it("returns premium when entitled", async () => {
    mockGet.mockResolvedValue({ data: () => ({ plan: "premium" }) });
    await expect(getPlan("uid-1")).resolves.toBe("premium");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm --filter functions exec vitest run src/lists/entitlements.test.ts`
Expected: FAIL — `Cannot find module './entitlements'`。

- [ ] **Step 3: 最小実装を書く**

`functions/src/lists/entitlements.ts`:

```ts
import { getFirestore } from "firebase-admin/firestore";

import type { Plan } from "./listLimit";

// PAY-004(RevenueCat Webhook)がentitlements/{uid}を同期するまでは
// ドキュメントが存在しない。存在しない・planがpremium以外は常にFreeとして扱う。
export async function getPlan(uid: string): Promise<Plan> {
  const snap = await getFirestore().collection("entitlements").doc(uid).get();
  return snap.data()?.plan === "premium" ? "premium" : "free";
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm --filter functions exec vitest run src/lists/entitlements.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/src/lists/entitlements.ts functions/src/lists/entitlements.test.ts
git commit -m "LIST-002: entitlements/{uid}からプランを取得する関数を追加"
```

---

## Task 4: functions — リスト作成のFirestore transaction (store層)

**Files:**
- Create: `functions/src/lists/listStore.ts`
- No test (このリポジトリの既存慣習: `otpStore.ts`同様、Firestore直叩き層は単体テスト対象外。Task 14の手動検証でカバーする)。

**Interfaces:**
- Consumes: `isUnderActiveListLimit`, `Plan`(`./listLimit`)。`ListType`(`@soroe/shared`)。
- Produces: `CreateListFields = { name: string; type: ListType; color: string; icon: string }`、`CreateListResult = { status: "created"; listId: string } | { status: "reused"; listId: string } | { status: "limit-reached" }`、`createListTransaction(uid: string, requestId: string, fields: CreateListFields, plan: Plan): Promise<CreateListResult>`。Task 5で `./listStore` としてimportされ、そのテストでmockされる。

- [ ] **Step 1: 実装を書く**

`functions/src/lists/listStore.ts`:

```ts
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { ListType } from "@soroe/shared";

import { isUnderActiveListLimit, type Plan } from "./listLimit";

export type CreateListFields = {
  name: string;
  type: ListType;
  color: string;
  icon: string;
};

export type CreateListResult =
  | { status: "created"; listId: string }
  | { status: "reused"; listId: string }
  | { status: "limit-reached" };

// requestIdごとの冪等性とFree上限の原子的判定をひとつのtransactionで行う。
// 同一uid+requestIdの再送は新規作成せず、最初の結果(listId)をそのまま返す。
export async function createListTransaction(
  uid: string,
  requestId: string,
  fields: CreateListFields,
  plan: Plan
): Promise<CreateListResult> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const requestRef = userRef.collection("createListRequests").doc(requestId);
  const activeListRefsQuery = userRef.collection("listRefs").where("archivedAt", "==", null);

  return db.runTransaction(async (tx) => {
    // Firestoreのtransactionはread-then-writeが必須。読み取りを先に終える。
    const requestSnap = await tx.get(requestRef);
    if (requestSnap.exists) {
      return { status: "reused" as const, listId: requestSnap.data()!.listId as string };
    }

    const activeSnap = await tx.get(activeListRefsQuery);
    if (!isUnderActiveListLimit(activeSnap.size, plan)) {
      return { status: "limit-reached" as const };
    }

    const listRef = db.collection("lists").doc();
    const now = FieldValue.serverTimestamp();

    tx.set(listRef, {
      name: fields.name,
      type: fields.type,
      color: fields.color,
      icon: fields.icon,
      ownerId: uid,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    });
    tx.set(listRef.collection("members").doc(uid), {
      role: "owner",
      joinedAt: now,
    });
    tx.set(userRef.collection("listRefs").doc(listRef.id), {
      name: fields.name,
      type: fields.type,
      color: fields.color,
      icon: fields.icon,
      role: "owner",
      totalCount: 0,
      completedCount: 0,
      memberCount: 1,
      updatedAt: now,
      archivedAt: null,
    });
    tx.set(requestRef, { listId: listRef.id, createdAt: now });

    return { status: "created" as const, listId: listRef.id };
  });
}
```

- [ ] **Step 2: typecheckを通す**

Run: `pnpm --filter functions run typecheck`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add functions/src/lists/listStore.ts
git commit -m "LIST-002: リスト作成のtransaction(冪等性+Free上限判定)を実装"
```

---

## Task 5: functions — createList Callable Function

**Files:**
- Create: `functions/src/lists/createList.ts`
- Test: `functions/src/lists/createList.test.ts`

**Interfaces:**
- Consumes: `createListRequestSchema`, `CreateListResponse`(`@soroe/shared`、Task 1)。`getPlan`(`./entitlements`、Task 3)。`createListTransaction`(`./listStore`、Task 4)。
- Produces: `createListHandler(input: unknown, uid: string): Promise<CreateListResponse>`(単体テスト対象)、`createList`(onCallでexportされるCloud Function、Task 7で`index.ts`からexport)。

- [ ] **Step 1: 失敗するテストを書く**

`functions/src/lists/createList.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createListHandler } from "./createList";
import * as entitlements from "./entitlements";
import * as listStore from "./listStore";

vi.mock("./entitlements");
vi.mock("./listStore");

const VALID_INPUT = {
  name: "今週の買い物",
  type: "shopping" as const,
  color: "primary",
  icon: "shopping-cart-simple",
  requestId: "req-1",
};

describe("createListHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entitlements.getPlan).mockResolvedValue("free");
  });

  it("creates a list and returns its id", async () => {
    vi.mocked(listStore.createListTransaction).mockResolvedValue({
      status: "created",
      listId: "list-1",
    });

    const result = await createListHandler(VALID_INPUT, "uid-1");

    expect(result).toEqual({ listId: "list-1" });
    expect(listStore.createListTransaction).toHaveBeenCalledWith(
      "uid-1",
      "req-1",
      { name: "今週の買い物", type: "shopping", color: "primary", icon: "shopping-cart-simple" },
      "free"
    );
  });

  it("returns the original listId on an idempotent replay", async () => {
    vi.mocked(listStore.createListTransaction).mockResolvedValue({
      status: "reused",
      listId: "list-1",
    });

    const result = await createListHandler(VALID_INPUT, "uid-1");

    expect(result).toEqual({ listId: "list-1" });
  });

  it("throws resource-exhausted when the free limit is reached", async () => {
    vi.mocked(listStore.createListTransaction).mockResolvedValue({ status: "limit-reached" });

    await expect(createListHandler(VALID_INPUT, "uid-1")).rejects.toMatchObject({
      code: "resource-exhausted",
    });
  });

  it("passes the caller's plan through to the transaction", async () => {
    vi.mocked(entitlements.getPlan).mockResolvedValue("premium");
    vi.mocked(listStore.createListTransaction).mockResolvedValue({
      status: "created",
      listId: "list-1",
    });

    await createListHandler(VALID_INPUT, "uid-1");

    expect(listStore.createListTransaction).toHaveBeenCalledWith(
      "uid-1",
      "req-1",
      expect.anything(),
      "premium"
    );
  });

  it("rejects an invalid name before touching Firestore", async () => {
    await expect(createListHandler({ ...VALID_INPUT, name: "" }, "uid-1")).rejects.toThrow();
    expect(listStore.createListTransaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm --filter functions exec vitest run src/lists/createList.test.ts`
Expected: FAIL — `Cannot find module './createList'`。

- [ ] **Step 3: 最小実装を書く**

`functions/src/lists/createList.ts`:

```ts
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createListRequestSchema, type CreateListResponse } from "@soroe/shared";

import { getPlan } from "./entitlements";
import { createListTransaction } from "./listStore";

export async function createListHandler(
  input: unknown,
  uid: string
): Promise<CreateListResponse> {
  const { requestId, ...fields } = createListRequestSchema.parse(input);

  const plan = await getPlan(uid);
  const result = await createListTransaction(uid, requestId, fields, plan);

  if (result.status === "limit-reached") {
    throw new HttpsError("resource-exhausted", "Freeプランで作成できるリストは3件までです");
  }

  return { listId: result.listId };
}

export const createList = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return createListHandler(request.data, request.auth.uid);
});
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm --filter functions exec vitest run src/lists/createList.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/src/lists/createList.ts functions/src/lists/createList.test.ts
git commit -m "LIST-002: createList Callable Functionを実装"
```

---

## Task 6: functions — listRefs同期トリガー

**Files:**
- Create: `functions/src/lists/syncListRef.ts`
- Test: `functions/src/lists/syncListRef.test.ts`

**Interfaces:**
- Produces: `syncListRefHandler(db, listId: string, before: DocumentData, after: DocumentData): Promise<void>`(単体テスト対象)、`syncListRef`(`onDocumentUpdated`でexportされるCloud Function、Task 7で`index.ts`からexport)。

**背景**: `firestore.rules`はownerによる`lists/{listId}`の直接update(name/color/icon/updatedAt)を許可しているが、`users/{uid}/listRefs/{listId}`への直接書込は拒否している(集計値はサーバーが持つため)。この差を埋めるため、`lists/{listId}`の更新を監視し全メンバーのlistRefsへ伝播するtriggerを作る。`createList`(Task 4)は生成時に自分でlistRefsも書くため、このtriggerは`onDocumentUpdated`(更新のみ)で十分。

- [ ] **Step 1: 失敗するテストを書く**

`functions/src/lists/syncListRef.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { syncListRefHandler } from "./syncListRef";

const BASE_FIELDS = {
  name: "今週の買い物",
  type: "shopping",
  color: "primary",
  icon: "shopping-cart-simple",
  archivedAt: null,
  updatedAt: "TIMESTAMP_1",
};

function fakeDb(memberUids: string[]) {
  const membersGet = vi.fn().mockResolvedValue({
    empty: memberUids.length === 0,
    docs: memberUids.map((uid) => ({ id: uid })),
  });
  const update = vi.fn();
  const commit = vi.fn().mockResolvedValue(undefined);

  const listsCollection = {
    doc: vi.fn(() => ({
      collection: vi.fn(() => ({ get: membersGet })),
    })),
  };

  const listRefDocMarker = { marker: "listRef" };
  const usersCollection = {
    doc: vi.fn(() => ({
      collection: vi.fn(() => ({
        doc: vi.fn(() => listRefDocMarker),
      })),
    })),
  };

  const db = {
    collection: vi.fn((name: string) => (name === "lists" ? listsCollection : usersCollection)),
    batch: vi.fn(() => ({ update, commit })),
  };

  return { db, update, commit };
}

describe("syncListRefHandler", () => {
  it("does nothing when no synced field changed", async () => {
    const { db, update, commit } = fakeDb(["owner-uid"]);

    await syncListRefHandler(db as never, "list-1", BASE_FIELDS, { ...BASE_FIELDS });

    expect(update).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("propagates a name change to every member's listRef", async () => {
    const { db, update, commit } = fakeDb(["owner-uid", "editor-uid"]);

    await syncListRefHandler(db as never, "list-1", BASE_FIELDS, {
      ...BASE_FIELDS,
      name: "変更後",
      updatedAt: "TIMESTAMP_2",
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledOnce();
    const [, patch] = update.mock.calls[0];
    expect(patch).toMatchObject({ name: "変更後", updatedAt: "TIMESTAMP_2" });
  });

  it("does nothing when the list has no members", async () => {
    const { db, update, commit } = fakeDb([]);

    await syncListRefHandler(db as never, "list-1", BASE_FIELDS, {
      ...BASE_FIELDS,
      color: "danger",
    });

    expect(update).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm --filter functions exec vitest run src/lists/syncListRef.test.ts`
Expected: FAIL — `Cannot find module './syncListRef'`。

- [ ] **Step 3: 最小実装を書く**

`functions/src/lists/syncListRef.ts`:

```ts
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

type SyncedFields = {
  name: unknown;
  type: unknown;
  color: unknown;
  icon: unknown;
  archivedAt: unknown;
  updatedAt: unknown;
};

function pickSyncedFields(data: DocumentData): SyncedFields {
  return {
    name: data.name,
    type: data.type,
    color: data.color,
    icon: data.icon,
    archivedAt: data.archivedAt,
    updatedAt: data.updatedAt,
  };
}

function hasSyncedFieldChange(before: SyncedFields, after: SyncedFields): boolean {
  return (
    before.name !== after.name ||
    before.type !== after.type ||
    before.color !== after.color ||
    before.icon !== after.icon ||
    before.archivedAt !== after.archivedAt
  );
}

// users/{uid}/listRefsは一覧画面用の非正規化コピー。lists/{listId}の表示用
// フィールドが変わったら全メンバーへ伝播する(Rulesがlistの直接書込をowner限定にし、
// listRefsへの直接書込自体をclientから拒否しているため)。
export async function syncListRefHandler(
  db: Pick<Firestore, "collection" | "batch">,
  listId: string,
  before: DocumentData,
  after: DocumentData
): Promise<void> {
  const beforeFields = pickSyncedFields(before);
  const afterFields = pickSyncedFields(after);
  if (!hasSyncedFieldChange(beforeFields, afterFields)) {
    return;
  }

  const membersSnap = await db.collection("lists").doc(listId).collection("members").get();
  if (membersSnap.empty) {
    return;
  }

  const batch = db.batch();
  for (const memberDoc of membersSnap.docs) {
    batch.update(
      db.collection("users").doc(memberDoc.id).collection("listRefs").doc(listId),
      afterFields
    );
  }
  await batch.commit();
}

export const syncListRef = onDocumentUpdated("lists/{listId}", async (event) => {
  if (!event.data) {
    return;
  }
  await syncListRefHandler(
    getFirestore(),
    event.params.listId,
    event.data.before.data(),
    event.data.after.data()
  );
});
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm --filter functions exec vitest run src/lists/syncListRef.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/src/lists/syncListRef.ts functions/src/lists/syncListRef.test.ts
git commit -m "LIST-002: list編集をlistRefsへ伝播するFirestore triggerを追加"
```

---

## Task 7: functions — index.tsへの登録とビルド確認

**Files:**
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `createList`(`./lists/createList`)、`syncListRef`(`./lists/syncListRef`)。

- [ ] **Step 1: エクスポートを追加する**

`functions/src/index.ts`:

```ts
import { initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";

// getFirestore()/getAuth()を使う前に必須。関数モジュールのimportより先に
// 評価されるよう、ここ(エントリポイントの最上部)で初期化する。
initializeApp();

export function pingHandler() {
  return { ok: true };
}

export const ping = onCall(() => pingHandler());

export { requestEmailOtp } from "./emailOtp/requestEmailOtp";
export { verifyEmailOtp } from "./emailOtp/verifyEmailOtp";
export { createList } from "./lists/createList";
export { syncListRef } from "./lists/syncListRef";
```

- [ ] **Step 2: 全体テスト・ビルドを確認する**

Run: `pnpm run ci`
Expected: PASS(build:shared → lint → typecheck → test → build:functions すべて通る)。

- [ ] **Step 3: コミット**

```bash
git add functions/src/index.ts
git commit -m "LIST-002: createList/syncListRefをFunctionsエントリポイントへ登録"
```

---

## Task 8: design-system — TemplateCardの色対応とIcon名ガード

**Files:**
- Modify: `apps/mobile/src/design-system/components/TemplateCard.tsx`
- Modify: `apps/mobile/src/design-system/icons/ph-icon-paths.ts`
- Modify: `apps/mobile/src/design-system/icons/Icon.tsx`
- Test: `apps/mobile/src/design-system/components/__tests__/components.test.tsx`

**Interfaces:**
- Produces: `TemplateCard`に`accentColor?: string`追加(既存呼び出しは無変更で動く)。`isPhIconName(value: string): value is PhIconName`を`@/design-system`からexport。

- [ ] **Step 1: 失敗するテストを書く**

`apps/mobile/src/design-system/components/__tests__/components.test.tsx` の `describe('TemplateCard', ...)` ブロックに追記(既存の1件に続けて):

```tsx
  it('renders with a custom accent color without throwing', async () => {
    await render(
      <TemplateCard
        icon="suitcase"
        title="1泊2日の旅行"
        subtitle="子連れの必需品・24項目"
        accentColor="#D9825B"
      />
    );
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm --filter mobile run test -- components.test.tsx`
Expected: TypeScriptエラー(`accentColor`が`TemplateCardProps`に存在しない)でFAIL。

- [ ] **Step 3: 最小実装を書く**

`apps/mobile/src/design-system/icons/ph-icon-paths.ts` の末尾(`export type PhIconName = ...`の後)に追記:

```ts
export function isPhIconName(value: string): value is PhIconName {
  return value in phIconPaths;
}
```

`apps/mobile/src/design-system/icons/Icon.tsx` のimport/export部分を変更:

```tsx
import Svg, { Path } from 'react-native-svg';

import { isPhIconName, PH_ICON_VIEWBOX_SIZE, phIconPaths, type PhIconName } from './ph-icon-paths';

export { isPhIconName };
export type { PhIconName };
```

`apps/mobile/src/design-system/components/TemplateCard.tsx` 全体を置き換え:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type PhIconName } from '../icons/Icon';
import { Border, Colors, Radius, Spacing, Typography } from '../tokens';

// docs/DesignSystem.pdf 04 (Template Card).
type TemplateCardProps = {
  icon: PhIconName;
  title: string;
  subtitle: string;
  onPress?: () => void;
  // LIST-002: リストの色選択を反映する場合に渡す。未指定時は従来通り
  // primarySoft/primaryStrongの組み合わせを使う。
  accentColor?: string;
};

export function TemplateCard({ icon, title, subtitle, onPress, accentColor }: TemplateCardProps) {
  const iconCircleBackground = accentColor ?? Colors.primarySoft;
  const iconColor = accentColor ? Colors.surface : Colors.primaryStrong;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.iconCircle, { backgroundColor: iconCircleBackground }]}>
        <Icon name={icon} color={iconColor} size={24} />
      </View>
      <View style={styles.textColumn}>
        <Text style={[Typography.heading, styles.title]}>{title}</Text>
        <Text style={[Typography.caption, styles.subtitle]}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 48,
    padding: Spacing[4],
    borderRadius: Radius.card,
    backgroundColor: Colors.surface,
    borderWidth: Border.default.width,
    borderColor: Border.default.color,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
  },
  title: {
    color: Colors.textPrimary,
  },
  subtitle: {
    color: Colors.textSecondary,
  },
});
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm --filter mobile run test -- components.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add apps/mobile/src/design-system/icons/ph-icon-paths.ts apps/mobile/src/design-system/icons/Icon.tsx apps/mobile/src/design-system/components/TemplateCard.tsx apps/mobile/src/design-system/components/__tests__/components.test.tsx
git commit -m "LIST-002: TemplateCardの色指定とアイコン名ガードを追加"
```

---

## Task 9: mobile — リスト作成フォームの選択肢定義

**Files:**
- Create: `apps/mobile/src/features/lists/listOptions.ts`

**Interfaces:**
- Consumes: `ListType`(`@soroe/shared`)。`Colors`, `type PhIconName`(`@/design-system`)。
- Produces: `LIST_TYPE_OPTIONS: { type: ListType; label: string; icon: PhIconName }[]`、`iconForListType(type: ListType): PhIconName`、`LIST_COLOR_OPTIONS: { token: string; label: string; value: string }[]`、`colorValueForToken(token: string): string`、`FREE_ACTIVE_LIST_LIMIT: number`。Task 12/13で使用する。

- [ ] **Step 1: 実装を書く**

`apps/mobile/src/features/lists/listOptions.ts`:

```ts
import type { ListType } from '@soroe/shared';

import { Colors, type PhIconName } from '@/design-system';

// LIST-002: リスト作成フォームの選択肢。docs/DesignSystem.pdf 05でバンドル
// されているアイコンの中から種別ごとに固定で1つ選ぶ(専用の「やること」用
// アイコンが無いため、チェックマークで代用する)。
export const LIST_TYPE_OPTIONS: { type: ListType; label: string; icon: PhIconName }[] = [
  { type: 'shopping', label: '買い物', icon: 'shopping-cart-simple' },
  { type: 'packing', label: '持ち物', icon: 'suitcase' },
  { type: 'task', label: 'やること', icon: 'check' },
];

export function iconForListType(type: ListType): PhIconName {
  return LIST_TYPE_OPTIONS.find((option) => option.type === type)?.icon ?? 'tray';
}

// 01カラートークンのうち、リストの目印として使う分だけを選ぶ。
// success/textPrimary等は他の意味(同期成功・本文)で使っているため含めない。
export const LIST_COLOR_OPTIONS: { token: string; label: string; value: string }[] = [
  { token: 'primary', label: 'グリーン', value: Colors.primary },
  { token: 'accent', label: 'オレンジ', value: Colors.accent },
  { token: 'warning', label: 'ゴールド', value: Colors.warning },
  { token: 'danger', label: 'レッド', value: Colors.danger },
];

export function colorValueForToken(token: string): string {
  return LIST_COLOR_OPTIONS.find((option) => option.token === token)?.value ?? Colors.primary;
}

// サーバー側(functions/src/lists/constants.ts)と同じ値。表示専用の目安であり、
// 実際の可否はcreateList Callableが原子的に判定する。
export const FREE_ACTIVE_LIST_LIMIT = 3;
```

- [ ] **Step 2: typecheckを通す**

Run: `pnpm --filter mobile run typecheck`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add apps/mobile/src/features/lists/listOptions.ts
git commit -m "LIST-002: リスト作成フォームの種別・色の選択肢を追加"
```

---

## Task 10: mobile — ListRepositoryの更新(createList型/updateList直接書込み化)

**Files:**
- Modify: `apps/mobile/src/features/lists/ListRepository.ts`

**Interfaces:**
- Consumes: `CreateListRequest`, `CreateListResponse`(`@soroe/shared`、Task 1)。
- Produces: `createList(input: CreateListInput, requestId: string): Promise<CreateListResponse>`(型を`CreateListRequest`/`CreateListResponse`ベースに変更、呼び出し方法は不変)。`EditableListFields = Pick<UpdateListInput, 'name' | 'color' | 'icon'>`、`updateList(listId: string, input: Partial<EditableListFields>): void`(Callable呼び出しから直接Firestore書込みへ変更)。Task 12で使用する。

**背景**: `firestore.rules`は`lists/{listId}`のname/color/icon/updatedAtをowner限定で直接client updateを許可している(typeは含まれない=不変)。既存の`updateList`はCallable Functionを呼ぶ実装だったが対応するFunctionは存在しないため、Rules準拠の直接書込みに直す。

- [ ] **Step 1: 実装を書く**

`apps/mobile/src/features/lists/ListRepository.ts` 全体を置き換え:

```ts
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import type {
  CreateListInput,
  CreateListItemInput,
  CreateListRequest,
  CreateListResponse,
  List,
  ListItem,
  UpdateListInput,
  UpdateListItemInput,
  UserListRef,
} from '@soroe/shared';

import { toList, toListItem, toUserListRef } from './converters';

// Firestoreへの唯一の窓口。soroe-technology-stack-evaluation.md 5章に従い、
// オフラインで完結してよい項目CRUDだけをclient writeにし、上限・権利・所有権が
// 絡む操作(リスト作成/複製/アーカイブ解除など)はCallable Functionsへ寄せる。
// Firestoreのtransactionはオフラインで失敗するため、その差が重要。

const LISTS = 'lists';
const ITEMS = 'items';
const USERS = 'users';
const LIST_REFS = 'listRefs';

function listsCollection() {
  return firestore().collection(LISTS);
}

function itemsCollection(listId: string) {
  return listsCollection().doc(listId).collection(ITEMS);
}

function listRefsCollection(uid: string) {
  return firestore().collection(USERS).doc(uid).collection(LIST_REFS);
}

/** 一覧画面用。全リストの全項目ではなく一覧用documentだけを購読する。 */
export function subscribeToUserLists(
  uid: string,
  onChange: (lists: UserListRef[]) => void,
  onError: (error: Error) => void
): () => void {
  return listRefsCollection(uid)
    .where('archivedAt', '==', null)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(
      (snapshot) => onChange(snapshot.docs.map((doc) => toUserListRef(doc.id, doc.data()))),
      onError
    );
}

export function subscribeToList(
  listId: string,
  onChange: (list: List | null) => void,
  onError: (error: Error) => void
): () => void {
  return listsCollection()
    .doc(listId)
    .onSnapshot((snapshot) => {
      const data = snapshot.data();
      onChange(data ? toList(snapshot.id, data) : null);
    }, onError);
}

/** 未同期の書込が残っているか。OFF-001のオフラインBanner判定に使う。 */
export type ListItemsSnapshot = {
  items: ListItem[];
  hasPendingWrites: boolean;
  isFromCache: boolean;
};

/** 詳細画面用。画面を離れたら必ず解除して読取課金を抑える。 */
export function subscribeToListItems(
  listId: string,
  onChange: (snapshot: ListItemsSnapshot) => void,
  onError: (error: Error) => void
): () => void {
  return itemsCollection(listId)
    .where('deletedAt', '==', null)
    .orderBy('sortOrder', 'asc')
    // includeMetadataChangesが無いと、書込がサーバーへ到達した瞬間の
    // hasPendingWrites=falseへの変化を受け取れない。
    .onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
      onChange({
        items: snapshot.docs.map((doc) => toListItem(doc.id, listId, doc.data())),
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        isFromCache: snapshot.metadata.fromCache,
      });
    }, onError);
}

// ---- 項目CRUD / リスト編集 (Rules付きclient write、オフライン可) ----

export async function addListItem(
  listId: string,
  uid: string,
  input: CreateListItemInput,
  sortOrder: number
): Promise<string> {
  const doc = itemsCollection(listId).doc();
  // awaitはサーバー到達を待つ: オフラインでは解決しないため、呼び出し側は
  // 完了を待たずに楽観的更新へ進める(Firestoreのローカルキャッシュが即反映する)。
  doc.set({
    name: input.name,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    category: input.category ?? null,
    note: input.note ?? null,
    assigneeId: input.assigneeId ?? null,
    dueAt: input.dueAt ? firestore.Timestamp.fromMillis(input.dueAt) : null,
    completedAt: null,
    completedBy: null,
    sortOrder,
    createdBy: uid,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  return doc.id;
}

export function updateListItem(listId: string, itemId: string, input: UpdateListItemInput): void {
  const patch: Record<string, unknown> = { updatedAt: firestore.FieldValue.serverTimestamp() };
  // 変更フィールドだけ更新する(LIST-03)。undefinedは「未指定」として無視し、
  // nullは「値を消す」として送る。
  if (input.name !== undefined) patch.name = input.name;
  if (input.quantity !== undefined) patch.quantity = input.quantity;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.category !== undefined) patch.category = input.category;
  if (input.note !== undefined) patch.note = input.note;
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
  if (input.dueAt !== undefined) {
    patch.dueAt = input.dueAt ? firestore.Timestamp.fromMillis(input.dueAt) : null;
  }

  itemsCollection(listId).doc(itemId).update(patch);
}

export function setListItemCompletion(
  listId: string,
  itemId: string,
  uid: string,
  completed: boolean
): void {
  itemsCollection(listId)
    .doc(itemId)
    .update({
      completedAt: completed ? firestore.FieldValue.serverTimestamp() : null,
      completedBy: completed ? uid : null,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
}

export function reorderListItem(listId: string, itemId: string, sortOrder: number): void {
  itemsCollection(listId)
    .doc(itemId)
    .update({ sortOrder, updatedAt: firestore.FieldValue.serverTimestamp() });
}

/** 論理削除。30日後の物理削除はサーバー側ジョブが行う(LIST-006)。 */
export function softDeleteListItem(listId: string, itemId: string): void {
  itemsCollection(listId)
    .doc(itemId)
    .update({
      deletedAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
}

// リスト自体はowner限定でclientから直接更新できる(firestore.rules L37-44)。
// typeはRulesが許可しないため対象外(作成後は不変)。denormalizeされた
// listRefsへの反映はFirestore trigger(functions/src/lists/syncListRef.ts)が行う。
export type EditableListFields = Pick<UpdateListInput, 'name' | 'color' | 'icon'>;

export function updateList(listId: string, input: Partial<EditableListFields>): void {
  const patch: Record<string, unknown> = { updatedAt: firestore.FieldValue.serverTimestamp() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (input.icon !== undefined) patch.icon = input.icon;

  listsCollection().doc(listId).update(patch);
}

// ---- リスト作成 (Callable Functions、オンライン必須) ----
// Free上限の原子的判定をクライアント申告に委ねないため、createListだけは
// Functions側の実装(LIST-002)を経由する。

export async function createList(
  input: CreateListInput,
  requestId: string
): Promise<CreateListResponse> {
  const callable = functions().httpsCallable<CreateListRequest, CreateListResponse>('createList');
  const result = await callable({ ...input, requestId });
  return result.data;
}
```

- [ ] **Step 2: typecheckを通す**

Run: `pnpm --filter mobile run typecheck`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add apps/mobile/src/features/lists/ListRepository.ts
git commit -m "LIST-002: updateListをRules準拠の直接書込みに変更"
```

---

## Task 11: mobile — 作成方法選択画面 (LIST-02)

**Files:**
- Create: `apps/mobile/src/app/new-list-method.tsx`
- Modify: `apps/mobile/src/app/_layout.tsx`

**Interfaces:**
- Produces: ルート`/new-list-method`(Stack modal)。

- [ ] **Step 1: 実装を書く**

`apps/mobile/src/app/new-list-method.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Colors, Spacing, Typography } from '@/design-system';

// LIST-02: 空/テンプレート/AIの3方式。テンプレートとAIは専用の作成フローが
// 未実装(TMPL-001/AI-*)のため、それぞれのタブ画面へ暫定的に遷移する。
export default function NewListMethodScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={[Typography.title, styles.title]}>作成方法を選ぶ</Text>

        <Button label="空のリストから" onPress={() => router.push('/new-list')} />
        <Button
          label="テンプレートから"
          onPress={() => router.push('/templates')}
          variant="secondary"
        />
        <Button label="AIで作る" onPress={() => router.push('/ai')} variant="secondary" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing[5],
    gap: Spacing[3],
  },
  title: {
    color: Colors.textPrimary,
  },
});
```

`apps/mobile/src/app/_layout.tsx` の`<Stack.Screen name="new-list" .../>`の直後に追加:

```tsx
      <Stack.Screen
        name="new-list-method"
        options={{ presentation: 'modal', headerShown: true, title: '作成方法を選ぶ' }}
      />
```

(変更後の`RootNavigator`内`<Stack>`は`invite/[token]` → `new-list` → `new-list-method`の順になる)

- [ ] **Step 2: typecheckを通す**

Run: `pnpm --filter mobile run typecheck`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add apps/mobile/src/app/new-list-method.tsx apps/mobile/src/app/_layout.tsx
git commit -m "LIST-002: 作成方法選択画面(LIST-02)を追加"
```

---

## Task 12: mobile — リスト作成/編集フォーム (LIST-03)

**Files:**
- Modify: `apps/mobile/src/app/new-list.tsx`

**Interfaces:**
- Consumes: `createList`, `updateList`, `subscribeToList`(`@/features/lists/ListRepository`、Task 10)。`LIST_TYPE_OPTIONS`, `LIST_COLOR_OPTIONS`, `iconForListType`(`@/features/lists/listOptions`、Task 9)。`createListInputSchema`(`@soroe/shared`)。
- Produces: ルート`/new-list`(作成)、`/new-list?listId=xxx`(編集、LIST-003の詳細画面が将来ここへ遷移する想定)。

**注記**: 編集モードへの実際のUI導線(リスト詳細のメニューから開く)はLIST-003(未実装)が担う。本タスクはフォーム自体を作成/編集の両対応にする。

- [ ] **Step 1: 実装を書く**

`apps/mobile/src/app/new-list.tsx` 全体を置き換え:

```tsx
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createListInputSchema, type List, type ListType } from '@soroe/shared';

import { Banner, Button, Chip, Colors, Input, Spacing, Typography } from '@/design-system';
import { LIST_COLOR_OPTIONS, LIST_TYPE_OPTIONS, iconForListType } from '@/features/lists/listOptions';
import { createList, subscribeToList, updateList } from '@/features/lists/ListRepository';

// LIST-03: 作成/編集を1フォームで扱う。listIdが無ければ新規作成、あれば
// 既存リストを購読して編集する(編集への実際の導線はLIST-003で追加される)。
export default function NewListScreen() {
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId?: string }>();
  const isEditing = Boolean(listId);

  const [requestId] = useState(() => randomUUID());
  const [name, setName] = useState('');
  const [type, setType] = useState<ListType>('shopping');
  const [colorToken, setColorToken] = useState('primary');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!listId) {
      return;
    }
    return subscribeToList(
      listId,
      (list: List | null) => {
        if (!list) {
          return;
        }
        setName(list.name);
        setType(list.type);
        setColorToken(list.color);
      },
      () => setRequestError('リストを読み込めませんでした')
    );
  }, [listId]);

  const submit = async () => {
    setValidationError(null);
    setRequestError(null);

    const icon = iconForListType(type);
    const parsed = createListInputSchema.safeParse({ name, type, color: colorToken, icon });
    if (!parsed.success) {
      setValidationError('リスト名は1〜60文字で入力してください');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && listId) {
        updateList(listId, { name: parsed.data.name, color: colorToken, icon });
        router.back();
        return;
      }

      const created = await createList(parsed.data, requestId);
      router.replace('/');
      void created;
    } catch (error) {
      const code = (error as { code?: string }).code;
      setRequestError(
        code === 'resource-exhausted'
          ? 'Freeプランで作成できるリストは3件までです'
          : '保存できませんでした。時間をおいてお試しください'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        {requestError ? <Banner message={requestError} variant="danger" /> : null}

        <Input
          placeholder="リスト名を入力"
          value={name}
          onChangeText={setName}
          autoFocus
          errorMessage={validationError ?? undefined}
          editable={!isSubmitting}
        />

        {!isEditing ? (
          <View style={styles.optionGroup}>
            <Text style={[Typography.label, styles.groupLabel]}>種別</Text>
            <View style={styles.rowWrap}>
              {LIST_TYPE_OPTIONS.map((option) => (
                <Chip
                  key={option.type}
                  label={option.label}
                  variant={option.type === type ? 'selected' : 'default'}
                  onPress={() => setType(option.type)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.optionGroup}>
          <Text style={[Typography.label, styles.groupLabel]}>色</Text>
          <View style={styles.rowWrap}>
            {LIST_COLOR_OPTIONS.map((option) => (
              <Pressable
                key={option.token}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: option.token === colorToken }}
                onPress={() => setColorToken(option.token)}
                hitSlop={Spacing[2]}
                style={[
                  styles.swatch,
                  { backgroundColor: option.value },
                  option.token === colorToken && styles.swatchSelected,
                ]}
              />
            ))}
          </View>
        </View>

        <Button
          label={isEditing ? '保存する' : '作成する'}
          onPress={submit}
          loading={isSubmitting}
          variant="primary"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing[5],
    gap: Spacing[4],
  },
  optionGroup: {
    gap: Spacing[2],
  },
  groupLabel: {
    color: Colors.textSecondary,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: Colors.textPrimary,
  },
});
```

- [ ] **Step 2: typecheckを通す**

Run: `pnpm --filter mobile run typecheck`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add apps/mobile/src/app/new-list.tsx
git commit -m "LIST-002: リスト作成/編集フォーム(LIST-03)を実装"
```

---

## Task 13: mobile — リスト一覧画面 (LIST-01)

**Files:**
- Modify: `apps/mobile/src/app/(app)/index.tsx`

**Interfaces:**
- Consumes: `subscribeToUserLists`(`@/features/lists/ListRepository`)。`colorValueForToken`, `FREE_ACTIVE_LIST_LIMIT`(`@/features/lists/listOptions`)。`useSession`(`@/features/session/SessionProvider`)。`isPhIconName`(`@/design-system`、Task 8)。

- [ ] **Step 1: 実装を書く**

`apps/mobile/src/app/(app)/index.tsx` 全体を置き換え:

```tsx
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { UserListRef } from '@soroe/shared';

import {
  Banner,
  Button,
  Colors,
  EmptyState,
  ErrorState,
  Skeleton,
  Spacing,
  TemplateCard,
  Typography,
  isPhIconName,
} from '@/design-system';
import { FREE_ACTIVE_LIST_LIMIT, colorValueForToken } from '@/features/lists/listOptions';
import { subscribeToUserLists } from '@/features/lists/ListRepository';
import { useSession } from '@/features/session/SessionProvider';

function summarize(list: UserListRef): string {
  return `${list.completedCount}/${list.totalCount}完了・${list.memberCount}人`;
}

export default function ListScreen() {
  const router = useRouter();
  // (app)グループはstatus==='authenticated'のときだけ描画される
  // (apps/mobile/src/app/_layout.tsx)。そのときprofileは必ず非null。
  const { profile } = useSession();
  const uid = profile!.uid;

  const [lists, setLists] = useState<UserListRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLimitBanner, setShowLimitBanner] = useState(false);

  useEffect(() => {
    setError(null);
    return subscribeToUserLists(
      uid,
      (nextLists) => setLists(nextLists),
      () => setError('リストを読み込めませんでした')
    );
  }, [uid]);

  const openCreateFlow = () => {
    if ((lists?.length ?? 0) >= FREE_ACTIVE_LIST_LIMIT) {
      setShowLimitBanner(true);
      return;
    }
    setShowLimitBanner(false);
    router.push('/new-list-method');
  };

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState title="読み込みに失敗しました" description={error} />
      </SafeAreaView>
    );
  }

  if (lists === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Skeleton width="100%" height={72} />
          <Skeleton width="100%" height={72} />
          <Skeleton width="100%" height={72} />
        </View>
      </SafeAreaView>
    );
  }

  if (lists.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <EmptyState
          title="リストがありません"
          description="最初のリストを作成しましょう"
          actionLabel="作成する"
          onAction={openCreateFlow}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[Typography.title, styles.headerTitle]}>リスト</Text>
          <Text style={[Typography.caption, styles.headerCount]}>
            {FREE_ACTIVE_LIST_LIMIT}件中{lists.length}件
          </Text>
        </View>

        {showLimitBanner ? (
          <Banner
            message={`Freeプランで作成できるリストは${FREE_ACTIVE_LIST_LIMIT}件までです`}
            variant="warning"
          />
        ) : null}

        {lists.map((list) => (
          <TemplateCard
            key={list.listId}
            icon={isPhIconName(list.icon) ? list.icon : 'tray'}
            title={list.name}
            subtitle={summarize(list)}
            accentColor={colorValueForToken(list.color)}
          />
        ))}

        <Button label="リストを追加" onPress={openCreateFlow} variant="secondary" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing[5],
    gap: Spacing[3],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.textPrimary,
  },
  headerCount: {
    color: Colors.textSecondary,
  },
});
```

- [ ] **Step 2: typecheckを通す**

Run: `pnpm --filter mobile run typecheck`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add "apps/mobile/src/app/(app)/index.tsx"
git commit -m "LIST-002: リスト一覧画面(LIST-01)を実装"
```

---

## Task 14: 全体検証(CI + Firebase Emulator + Web preview)

**Files:** なし(検証のみ)。

- [ ] **Step 1: CIを通す**

Run: `pnpm run ci`
Expected: PASS

- [ ] **Step 2: Rulesテストを通す**

Run: `pnpm --filter functions run test:rules`
Expected: PASS(既存31件 + 変更なし。`createList`/`syncListRef`はAdmin SDK経由のためRulesテスト対象外)。

- [ ] **Step 3: Firebase Emulatorを起動する**

Run: `pnpm --filter functions run serve`(Auth/Firestore/Functions Emulatorが立ち上がる。別ターミナルで実行)

- [ ] **Step 4: Web previewで一気通貫の動作確認をする**

`apps/mobile/.env.local`がEmulator向けであることを確認した上で、Web previewを起動しブラウザで以下を確認する:

1. サインイン後、リスト一覧が空状態("リストがありません")で表示される。
2. 「作成する」→ 作成方法選択画面が開く。
3. 「空のリストから」→ 作成フォームが開く。リスト名を入力、種別・色を選択し「作成する」。
4. 一覧画面に戻り、作成したリストが正しい名前・アイコン・色・進捗(`0/0完了・1人`)で表示される。
5. 同じ手順で合計3件作成する。ヘッダーに「3件中3件」と表示される。
6. 4件目の作成を試みる→「リストを追加」タップ時点でBanner「Freeプランで作成できるリストは3件までです」が表示され、作成方法選択画面へ遷移しないことを確認する。
7. (任意)Firestore Emulator UIで`users/{uid}/createListRequests/{requestId}`が作成されていること、`lists/{listId}/members/{uid}`が`role: owner`で作成されていることを確認する。

- [ ] **Step 5: 記録**

Expected: 全項目が確認できたら、このタスクにチェックを入れて完了とする。既知の制約(編集フローの導線はLIST-003待ち、テンプレート/AI作成はTMPL-001/AI-*待ち)を実装者向けメモとして残す必要はない(このplanに既述のため)。

---

## Self-Review Notes

- **Spec coverage**: LIST-01(一覧・空状態・Free件数表示)→Task 13。LIST-02(作成方法選択)→Task 11。LIST-03(作成・編集、Free上限、名前/種別/色/アイコン、requestId冪等)→Task 1, 4, 5, 12。denormalize整合→Task 6。すべてTaskに対応済み。
- **Placeholder scan**: 各Stepに実コードを記載済み。TODO/後で実装は無し。
- **Type consistency**: `CreateListResponse`(Task 1)は`createList`(Task 10)の戻り値型と一致。`CreateListFields`(Task 4)のフィールド名(`name/type/color/icon`)は`createListHandler`(Task 5)の分割代入結果と一致。`EditableListFields`(Task 10)は`updateList`(Task 12)呼び出しのプロパティ(`name/color/icon`)と一致。`isPhIconName`(Task 8)は`index.tsx`(Task 13)で使用する名前と一致。
