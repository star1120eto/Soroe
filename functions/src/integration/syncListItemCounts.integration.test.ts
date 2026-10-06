import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { syncListItemCountsHandler } from "../lists/syncListItemCounts";
import { clearEmulator, connectEmulator } from "./emulator";

// 項目数の集計(lists/{id}/items -> users/{uid}/listRefs)を実Firestore Emulatorで検証する。
// 並行実行・メンバー削除・物理削除との競合で、古い値が勝ったり、削除済みのlistRefが
// 不完全なドキュメントとして復活したりしないことを確認する。
const PROJECT_ID = "soroe-it-sync-counts";
const LIST_ID = "list-1";
const OWNER = "owner-uid";
const EDITOR = "editor-uid";

let db: Firestore;

beforeAll(() => {
  db = connectEmulator(PROJECT_ID);
});

async function seedMember(uid: string, role: "owner" | "editor", withListRef = true) {
  await db.doc(`lists/${LIST_ID}/members/${uid}`).set({ role, joinedAt: Timestamp.now(), displayName: uid });
  if (withListRef) {
    await db.doc(`users/${uid}/listRefs/${LIST_ID}`).set({
      name: "今週の買い物",
      type: "shopping",
      role,
      totalCount: 0,
      completedCount: 0,
      memberCount: 2,
      archivedAt: null,
      deletedAt: null,
    });
  }
}

async function addItem(name: string, overrides: Record<string, unknown> = {}) {
  await db.collection(`lists/${LIST_ID}/items`).add({
    name,
    completedAt: null,
    deletedAt: null,
    sortOrder: 1000,
    ...overrides,
  });
}

const listRefOf = async (uid: string) => (await db.doc(`users/${uid}/listRefs/${LIST_ID}`).get()).data();

beforeEach(async () => {
  await clearEmulator(PROJECT_ID);
  await db.doc(`lists/${LIST_ID}`).set({ name: "今週の買い物", ownerId: OWNER });
  await seedMember(OWNER, "owner");
  await seedMember(EDITOR, "editor");
});

describe("syncListItemCountsHandler", () => {
  it("propagates the total and completed counts to every member's listRef", async () => {
    await addItem("トマト");
    await addItem("牛乳", { completedAt: Timestamp.now() });
    await addItem("卵", { completedAt: Timestamp.now() });

    await syncListItemCountsHandler(db, LIST_ID);

    for (const uid of [OWNER, EDITOR]) {
      expect(await listRefOf(uid)).toMatchObject({ totalCount: 3, completedCount: 2 });
    }
  });

  it("leaves the other listRef fields untouched", async () => {
    await addItem("トマト");

    await syncListItemCountsHandler(db, LIST_ID);

    expect(await listRefOf(OWNER)).toMatchObject({ name: "今週の買い物", role: "owner", memberCount: 2 });
  });

  it("does not count soft-deleted items", async () => {
    await addItem("残る");
    await addItem("消した", { deletedAt: Timestamp.now(), completedAt: Timestamp.now() });

    await syncListItemCountsHandler(db, LIST_ID);

    expect(await listRefOf(OWNER)).toMatchObject({ totalCount: 1, completedCount: 0 });
  });

  it("does not resurrect a deleted listRef as a partial document (member removed mid-flight)", async () => {
    await addItem("トマト");
    // メンバーのmemberドキュメントは残っているが、listRefだけが既に消えている状態。
    await db.doc(`users/${EDITOR}/listRefs/${LIST_ID}`).delete();

    await syncListItemCountsHandler(db, LIST_ID);

    expect((await db.doc(`users/${EDITOR}/listRefs/${LIST_ID}`).get()).exists).toBe(false);
    expect(await listRefOf(OWNER)).toMatchObject({ totalCount: 1 });
  });

  it("writes nothing when the list has no members left (purged list)", async () => {
    await addItem("トマト");
    await db.doc(`lists/${LIST_ID}/members/${OWNER}`).delete();
    await db.doc(`lists/${LIST_ID}/members/${EDITOR}`).delete();
    await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).delete();
    await db.doc(`users/${EDITOR}/listRefs/${LIST_ID}`).delete();

    await syncListItemCountsHandler(db, LIST_ID);

    expect((await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).get()).exists).toBe(false);
    expect((await db.doc(`users/${EDITOR}/listRefs/${LIST_ID}`).get()).exists).toBe(false);
  });

  it("skips the write when the counts have not changed", async () => {
    await addItem("トマト");
    await syncListItemCountsHandler(db, LIST_ID);
    const before = (await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).get()).updateTime!.toMillis();

    await syncListItemCountsHandler(db, LIST_ID);

    const after = (await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).get()).updateTime!.toMillis();
    expect(after).toBe(before);
  });

  it("converges to the true counts when invocations race with item writes", async () => {
    // 複数の項目書込みと集計が同時に走っても、最後に書かれた値が最新の状態と一致する。
    const writes = Array.from({ length: 12 }, (_, i) => addItem(`項目${i}`, i % 3 === 0 ? { completedAt: Timestamp.now() } : {}));
    const syncs = Array.from({ length: 6 }, () => syncListItemCountsHandler(db, LIST_ID));
    await Promise.all([...writes, ...syncs]);

    // 競合の後に1回集計すれば(実際は各書込みのtriggerが走る)、必ず真の値になる。
    await syncListItemCountsHandler(db, LIST_ID);

    expect(await listRefOf(OWNER)).toMatchObject({ totalCount: 12, completedCount: 4 });
    expect(await listRefOf(EDITOR)).toMatchObject({ totalCount: 12, completedCount: 4 });
  });
});
