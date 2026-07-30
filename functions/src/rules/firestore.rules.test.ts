import { readFileSync } from "node:fs";
import path from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// LIST-001「Rulesを実装する」の検証。Firestore Emulatorが必要:
//   firebase emulators:exec --only firestore 'pnpm --filter functions run test:rules'
const OWNER = "owner-uid";
const EDITOR = "editor-uid";
const OUTSIDER = "outsider-uid";
const LIST_ID = "list-1";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "soroe-rules-test",
    firestore: {
      rules: readFileSync(path.resolve(__dirname, "../../../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Rulesを迂回して前提データ(リストとメンバー)を作る。
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`lists/${LIST_ID}`).set({
      name: "今週の買い物",
      type: "shopping",
      color: "primary",
      icon: "ph:shopping-cart-simple",
      ownerId: OWNER,
      createdBy: OWNER,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      deletedAt: null,
    });
    await db.doc(`lists/${LIST_ID}/members/${OWNER}`).set({ role: "owner", joinedAt: new Date() });
    await db.doc(`lists/${LIST_ID}/members/${EDITOR}`).set({ role: "editor", joinedAt: new Date() });
    await db.doc(`lists/${LIST_ID}/items/item-1`).set({
      name: "トマト",
      createdBy: EDITOR,
      sortOrder: 1000,
      completedAt: null,
      completedBy: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).set({ name: "今週の買い物", role: "owner" });
  });
});

function db(uid: string | null) {
  return uid === null
    ? testEnv.unauthenticatedContext().firestore()
    : testEnv.authenticatedContext(uid).firestore();
}

describe("users/{uid}", () => {
  it("本人は読み書きできる", async () => {
    await assertSucceeds(db(OWNER).doc(`users/${OWNER}`).set({ displayName: "たろう" }));
  });

  it("他人は読めない", async () => {
    await assertFails(db(OUTSIDER).doc(`users/${OWNER}`).get());
  });

  it("未認証は読めない", async () => {
    await assertFails(db(null).doc(`users/${OWNER}`).get());
  });
});

describe("users/{uid}/listRefs", () => {
  it("本人は読める", async () => {
    await assertSucceeds(db(OWNER).doc(`users/${OWNER}/listRefs/${LIST_ID}`).get());
  });

  it("他人は読めない", async () => {
    await assertFails(db(OUTSIDER).doc(`users/${OWNER}/listRefs/${LIST_ID}`).get());
  });

  it("集計値はサーバーが持つため本人でも書けない", async () => {
    await assertFails(db(OWNER).doc(`users/${OWNER}/listRefs/${LIST_ID}`).set({ totalCount: 999 }));
  });
});

describe("lists/{listId}", () => {
  it("メンバーは読める", async () => {
    await assertSucceeds(db(EDITOR).doc(`lists/${LIST_ID}`).get());
  });

  it("非メンバーは読めない", async () => {
    await assertFails(db(OUTSIDER).doc(`lists/${LIST_ID}`).get());
  });

  it("Free上限判定が要るためclientからは作成できない", async () => {
    await assertFails(db(OWNER).doc("lists/new-list").set({ name: "新しいリスト" }));
  });

  it("オーナーは表示用の情報を更新できる", async () => {
    await assertSucceeds(
      db(OWNER).doc(`lists/${LIST_ID}`).update({ name: "変更後", updatedAt: new Date() })
    );
  });

  it("編集者はリスト自体を更新できない", async () => {
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}`).update({ name: "変更後" }));
  });

  it("オーナーでも61文字の名前には更新できない", async () => {
    await assertFails(
      db(OWNER).doc(`lists/${LIST_ID}`).update({ name: "あ".repeat(61), updatedAt: new Date() })
    );
  });

  it("オーナーでも種別は直接変更できない", async () => {
    await assertFails(db(OWNER).doc(`lists/${LIST_ID}`).update({ type: "task", updatedAt: new Date() }));
  });

  it("オーナーでも所有権は移譲できない", async () => {
    await assertFails(db(OWNER).doc(`lists/${LIST_ID}`).update({ ownerId: OUTSIDER }));
  });

  it("オーナーでもアーカイブ状態は直接変更できない", async () => {
    await assertFails(db(OWNER).doc(`lists/${LIST_ID}`).update({ archivedAt: new Date() }));
  });

  it("clientからは削除できない", async () => {
    await assertFails(db(OWNER).doc(`lists/${LIST_ID}`).delete());
  });
});

describe("lists/{listId}/items", () => {
  const validItem = {
    name: "きゅうり",
    createdBy: EDITOR,
    sortOrder: 2000,
    completedAt: null,
    completedBy: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("メンバーは項目を追加できる", async () => {
    await assertSucceeds(db(EDITOR).doc(`lists/${LIST_ID}/items/item-2`).set(validItem));
  });

  it("非メンバーは項目を追加できない", async () => {
    await assertFails(
      db(OUTSIDER).doc(`lists/${LIST_ID}/items/item-2`).set({ ...validItem, createdBy: OUTSIDER })
    );
  });

  it("createdByを他人に詐称して追加できない", async () => {
    await assertFails(
      db(EDITOR).doc(`lists/${LIST_ID}/items/item-2`).set({ ...validItem, createdBy: OWNER })
    );
  });

  it("空の項目名は追加できない", async () => {
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}/items/item-2`).set({ ...validItem, name: "" }));
  });

  it("100文字を超える項目名は追加できない", async () => {
    await assertFails(
      db(EDITOR).doc(`lists/${LIST_ID}/items/item-2`).set({ ...validItem, name: "あ".repeat(101) })
    );
  });

  it("削除済みの状態では追加できない", async () => {
    await assertFails(
      db(EDITOR).doc(`lists/${LIST_ID}/items/item-2`).set({ ...validItem, deletedAt: new Date() })
    );
  });

  it("メンバーは他人が作った項目も完了にできる", async () => {
    await assertSucceeds(
      db(OWNER)
        .doc(`lists/${LIST_ID}/items/item-1`)
        .update({ completedAt: new Date(), completedBy: OWNER, updatedAt: new Date() })
    );
  });

  it("メンバーは論理削除できる", async () => {
    await assertSucceeds(
      db(EDITOR)
        .doc(`lists/${LIST_ID}/items/item-1`)
        .update({ deletedAt: new Date(), updatedAt: new Date() })
    );
  });

  it("更新時にcreatedByを書き換えられない", async () => {
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}/items/item-1`).update({ createdBy: OUTSIDER }));
  });

  it("非メンバーは更新できない", async () => {
    await assertFails(db(OUTSIDER).doc(`lists/${LIST_ID}/items/item-1`).update({ name: "改" }));
  });

  it("復元不能な物理削除はできない", async () => {
    await assertFails(db(OWNER).doc(`lists/${LIST_ID}/items/item-1`).delete());
  });
});

describe("lists/{listId}/members", () => {
  it("メンバーは構成を読める", async () => {
    await assertSucceeds(db(EDITOR).doc(`lists/${LIST_ID}/members/${OWNER}`).get());
  });

  it("非メンバーは読めない", async () => {
    await assertFails(db(OUTSIDER).doc(`lists/${LIST_ID}/members/${OWNER}`).get());
  });

  it("自分を勝手にメンバーへ追加できない", async () => {
    await assertFails(
      db(OUTSIDER).doc(`lists/${LIST_ID}/members/${OUTSIDER}`).set({ role: "editor" })
    );
  });

  it("オーナーでも直接メンバーを追加できない(招待検証が要る)", async () => {
    await assertFails(db(OWNER).doc(`lists/${LIST_ID}/members/${OUTSIDER}`).set({ role: "editor" }));
  });

  it("自分の権限を昇格できない", async () => {
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}/members/${EDITOR}`).update({ role: "owner" }));
  });
});

// Rulesファイル自体が読み込めているかの保険(パス間違いで全テストが
// 素通りするのを防ぐ)。
it("rulesファイルを読み込めている", () => {
  const rules = readFileSync(path.resolve(__dirname, "../../../firestore.rules"), "utf8");
  expect(rules).toContain("match /lists/{listId}");
});
