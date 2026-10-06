import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { addMemberTransaction } from "../lists/memberStore";
import { clearEmulator, connectEmulator } from "./emulator";

// SHARE-001「メンバー追加と一覧参照作成は原子的・冪等に行う」の検証。
const PROJECT_ID = "soroe-it-member-store";
const LIST_ID = "list-1";
const OWNER = "owner-uid";
const JOINER = "joiner-uid";

let db: Firestore;

beforeAll(() => {
  db = connectEmulator(PROJECT_ID);
});

async function seedList(overrides: Record<string, unknown> = {}) {
  const now = Timestamp.now();
  await db.doc(`lists/${LIST_ID}`).set({
    name: "今週の買い物",
    type: "shopping",
    color: "primary",
    icon: "ph:shopping-cart-simple",
    ownerId: OWNER,
    createdBy: OWNER,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    deletedAt: null,
    ...overrides,
  });
  await db.doc(`lists/${LIST_ID}/members/${OWNER}`).set({ role: "owner", joinedAt: now, displayName: "たろう" });
  await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).set({
    name: "今週の買い物",
    type: "shopping",
    color: "primary",
    icon: "ph:shopping-cart-simple",
    role: "owner",
    totalCount: 4,
    completedCount: 1,
    memberCount: 1,
    updatedAt: now,
    archivedAt: null,
    deletedAt: null,
  });
}

async function seedActiveListRefs(uid: string, count: number, archivedAt: Timestamp | null = null) {
  for (let i = 0; i < count; i++) {
    await db.doc(`users/${uid}/listRefs/other-${archivedAt ? "archived" : "active"}-${i}`).set({
      name: `他のリスト${i}`,
      role: "owner",
      archivedAt,
    });
  }
}

beforeEach(async () => {
  await clearEmulator(PROJECT_ID);
  await seedList();
});

describe("addMemberTransaction", () => {
  it("creates the member and the joiner's listRef together", async () => {
    const result = await addMemberTransaction(LIST_ID, JOINER, "editor", "free", "はなこ");

    expect(result).toEqual({ status: "added" });
    const member = (await db.doc(`lists/${LIST_ID}/members/${JOINER}`).get()).data();
    expect(member).toMatchObject({ role: "editor", displayName: "はなこ" });
    const listRef = (await db.doc(`users/${JOINER}/listRefs/${LIST_ID}`).get()).data();
    expect(listRef).toMatchObject({
      name: "今週の買い物",
      type: "shopping",
      color: "primary",
      icon: "ph:shopping-cart-simple",
      role: "editor",
      archivedAt: null,
      deletedAt: null,
      memberCount: 2,
      // 参加直後の初期表示用に、既存の集計値を引き継ぐ。
      totalCount: 4,
      completedCount: 1,
    });
  });

  it("updates memberCount on every existing member's listRef", async () => {
    await addMemberTransaction(LIST_ID, JOINER, "editor", "free", "はなこ");
    await addMemberTransaction(LIST_ID, "third-uid", "editor", "free", null);

    for (const uid of [OWNER, JOINER, "third-uid"]) {
      const listRef = (await db.doc(`users/${uid}/listRefs/${LIST_ID}`).get()).data();
      expect(listRef?.memberCount).toBe(3);
    }
  });

  it("is idempotent: a second call reports already-member and writes nothing", async () => {
    await addMemberTransaction(LIST_ID, JOINER, "editor", "free", "はなこ");
    const before = (await db.doc(`lists/${LIST_ID}/members/${JOINER}`).get()).data();

    const result = await addMemberTransaction(LIST_ID, JOINER, "editor", "free", "べつの名前");

    expect(result).toEqual({ status: "already-member" });
    const after = (await db.doc(`lists/${LIST_ID}/members/${JOINER}`).get()).data();
    expect(after).toEqual(before);
    const listRef = (await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).get()).data();
    expect(listRef?.memberCount).toBe(2);
  });

  it("refuses a Free joiner who already has 3 active lists, leaving no partial writes", async () => {
    await seedActiveListRefs(JOINER, 3);

    const result = await addMemberTransaction(LIST_ID, JOINER, "editor", "free", "はなこ");

    expect(result).toEqual({ status: "limit-reached" });
    expect((await db.doc(`lists/${LIST_ID}/members/${JOINER}`).get()).exists).toBe(false);
    expect((await db.doc(`users/${JOINER}/listRefs/${LIST_ID}`).get()).exists).toBe(false);
    const ownerListRef = (await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).get()).data();
    expect(ownerListRef?.memberCount).toBe(1);
  });

  it("does not count archived lists toward the Free limit", async () => {
    await seedActiveListRefs(JOINER, 2);
    await seedActiveListRefs(JOINER, 2, Timestamp.now());

    await expect(addMemberTransaction(LIST_ID, JOINER, "editor", "free", "はなこ")).resolves.toEqual({
      status: "added",
    });
  });

  it("lets a Premium joiner exceed the Free limit", async () => {
    await seedActiveListRefs(JOINER, 3);

    await expect(addMemberTransaction(LIST_ID, JOINER, "editor", "premium", "はなこ")).resolves.toEqual({
      status: "added",
    });
  });

  it("reports not-found for a missing list without creating anything", async () => {
    const result = await addMemberTransaction("missing-list", JOINER, "editor", "free", "はなこ");

    expect(result).toEqual({ status: "not-found" });
    expect((await db.doc(`users/${JOINER}/listRefs/missing-list`).get()).exists).toBe(false);
  });

  it("does not let two concurrent joins exceed the Free limit", async () => {
    // 参加者が2件持っている状態で、別々の2リストへ同時に参加する。
    // transactionが直列化されるため、片方だけが成功する(合計3件で止まる)。
    await seedActiveListRefs(JOINER, 2);
    await db.doc("lists/list-2").set({
      name: "別のリスト",
      type: "task",
      color: "primary",
      icon: "ph:check",
      ownerId: OWNER,
      createdBy: OWNER,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      archivedAt: null,
      deletedAt: null,
    });
    await db.doc(`lists/list-2/members/${OWNER}`).set({ role: "owner", joinedAt: Timestamp.now() });
    await db.doc(`users/${OWNER}/listRefs/list-2`).set({ role: "owner", archivedAt: null });

    const results = await Promise.all([
      addMemberTransaction(LIST_ID, JOINER, "editor", "free", "はなこ"),
      addMemberTransaction("list-2", JOINER, "editor", "free", "はなこ"),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(["added", "limit-reached"]);
  });
});
