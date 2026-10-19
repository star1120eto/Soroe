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

  it("編集者もリスト名・色・アイコンを更新できる(仕様2.3)", async () => {
    await assertSucceeds(
      db(EDITOR)
        .doc(`lists/${LIST_ID}`)
        .update({ name: "編集者が変更", color: "accent", icon: "ph:tray", updatedAt: new Date() })
    );
  });

  it("非メンバーはリストを更新できない", async () => {
    await assertFails(db(OUTSIDER).doc(`lists/${LIST_ID}`).update({ name: "変更後", updatedAt: new Date() }));
  });

  it("編集者でも所有権は変更できない", async () => {
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}`).update({ ownerId: EDITOR }));
  });

  it("編集者でもアーカイブ・削除状態は直接変更できない", async () => {
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}`).update({ archivedAt: new Date() }));
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}`).update({ deletedAt: new Date() }));
  });

  it("編集者でもclientからは削除できない", async () => {
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}`).delete());
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

  it("アーカイブ中は読み取り専用でオーナーでも表示情報を更新できない(LIST-05)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`lists/${LIST_ID}`).update({ archivedAt: new Date() });
    });
    await assertFails(
      db(OWNER).doc(`lists/${LIST_ID}`).update({ name: "変更後", updatedAt: new Date() })
    );
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

  it("アーカイブ中のリストには項目を追加できない(LIST-05)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`lists/${LIST_ID}`).update({ archivedAt: new Date() });
    });
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}/items/item-2`).set(validItem));
  });

  it("アーカイブ中のリストの項目は完了・編集できない(LIST-05)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`lists/${LIST_ID}`).update({ archivedAt: new Date() });
    });
    await assertFails(
      db(OWNER)
        .doc(`lists/${LIST_ID}/items/item-1`)
        .update({ completedAt: new Date(), completedBy: OWNER, updatedAt: new Date() })
    );
  });

  it("削除済みのリストには項目を追加できない(LIST-05)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`lists/${LIST_ID}`).update({ deletedAt: new Date() });
    });
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}/items/item-2`).set(validItem));
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

describe("lists/{listId}/members (SHARE-001)", () => {
  it("オーナーでも編集者を直接削除できない(削除はFunctions経由)", async () => {
    await assertFails(db(OWNER).doc(`lists/${LIST_ID}/members/${EDITOR}`).delete());
  });

  it("編集者は自分でも直接退出できない(退出はFunctions経由)", async () => {
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}/members/${EDITOR}`).delete());
  });

  it("オーナーでも直接所有権(role)を移譲できない", async () => {
    await assertFails(db(OWNER).doc(`lists/${LIST_ID}/members/${EDITOR}`).update({ role: "owner" }));
    await assertFails(db(OWNER).doc(`lists/${LIST_ID}/members/${OWNER}`).update({ role: "editor" }));
  });
});

describe("users/{uid}/listRefs (SHARE-001)", () => {
  it("同じリストのメンバーでも他人の一覧参照は読めない", async () => {
    await assertFails(db(EDITOR).doc(`users/${OWNER}/listRefs/${LIST_ID}`).get());
  });

  it("本人でも削除できない(削除はFunctions経由)", async () => {
    await assertFails(db(OWNER).doc(`users/${OWNER}/listRefs/${LIST_ID}`).delete());
  });
});

describe("invites/{inviteId} (SHARE-002)", () => {
  const INVITE_ID = "invite-hash-1";
  const activeInvite = {
    listId: LIST_ID,
    inviterId: OWNER,
    status: "active",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
  };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc(`invites/${INVITE_ID}`).set(activeInvite);
      await adminDb.doc("invites/other-list-invite").set({ ...activeInvite, listId: "list-2" });
    });
  });

  it("オーナーは自分のリストの有効な招待を一覧できる", async () => {
    const snapshot = await assertSucceeds(
      db(OWNER)
        .collection("invites")
        .where("listId", "==", LIST_ID)
        .where("status", "==", "active")
        .get()
    );
    expect(snapshot.size).toBe(1);
  });

  it("編集者は招待を読めない(招待作成・取消はオーナーのみ)", async () => {
    await assertFails(db(EDITOR).collection("invites").where("listId", "==", LIST_ID).get());
    await assertFails(db(EDITOR).doc(`invites/${INVITE_ID}`).get());
  });

  it("非メンバー・未認証は招待を読めない", async () => {
    await assertFails(db(OUTSIDER).doc(`invites/${INVITE_ID}`).get());
    await assertFails(db(null).doc(`invites/${INVITE_ID}`).get());
  });

  it("オーナーでも絞り込み無しで全招待を列挙できない", async () => {
    await assertFails(db(OWNER).collection("invites").get());
  });

  it("オーナーでも他のリストの招待は読めない", async () => {
    await assertFails(db(OWNER).doc("invites/other-list-invite").get());
  });

  it("オーナーでも招待をclientから作成・更新・削除できない(Functions経由)", async () => {
    await assertFails(db(OWNER).doc("invites/new-invite").set({ ...activeInvite }));
    await assertFails(db(OWNER).doc(`invites/${INVITE_ID}`).update({ status: "revoked" }));
    await assertFails(db(OWNER).doc(`invites/${INVITE_ID}`).delete());
  });
});

describe("権限喪失後の購読(SHARE-004)", () => {
  beforeEach(async () => {
    // 削除・退出はFunctions(Admin SDK)がmembersドキュメントを消すことで成立する。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`lists/${LIST_ID}/members/${EDITOR}`).delete();
    });
  });

  it("リスト・項目・メンバーを購読できなくなる", async () => {
    await assertFails(db(EDITOR).doc(`lists/${LIST_ID}`).get());
    await assertFails(db(EDITOR).collection(`lists/${LIST_ID}/items`).get());
    await assertFails(db(EDITOR).collection(`lists/${LIST_ID}/members`).get());
  });

  it("項目の追加・完了もできなくなる", async () => {
    await assertFails(
      db(EDITOR).doc(`lists/${LIST_ID}/items/item-2`).set({
        name: "追加",
        createdBy: EDITOR,
        sortOrder: 2000,
        completedAt: null,
        completedBy: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
    await assertFails(
      db(EDITOR)
        .doc(`lists/${LIST_ID}/items/item-1`)
        .update({ completedAt: new Date(), completedBy: EDITOR, updatedAt: new Date() })
    );
  });

  it("残ったメンバー(オーナー)は引き続き操作できる", async () => {
    await assertSucceeds(db(OWNER).doc(`lists/${LIST_ID}`).get());
  });
});

// Rulesファイル自体が読み込めているかの保険(パス間違いで全テストが
// 素通りするのを防ぐ)。
it("rulesファイルを読み込めている", () => {
  const rules = readFileSync(path.resolve(__dirname, "../../../firestore.rules"), "utf8");
  expect(rules).toContain("match /lists/{listId}");
});

// TMPL-001 / MYTM: 公式テンプレートの読取と、マイテンプレートの更新の制限。
describe("templates", () => {
  const MYSELF = "template-owner";
  const OTHER = "other-user";

  const myTemplate = (overrides: Record<string, unknown> = {}) => ({
    title: "週末のキャンプ",
    description: null,
    listType: "packing",
    icon: "suitcase",
    color: "primary",
    itemCount: 2,
    items: [
      { id: "a", name: "テント", quantity: null, unit: null, category: null, note: null, checked: false },
      { id: "b", name: "寝袋", quantity: null, unit: null, category: null, note: null, checked: false },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc("officialTemplates/day-hike").set({ published: true, category: "outdoor" });
      await db.doc("officialTemplates/day-hike/items/water").set({ sortOrder: 1000 });
      await db.doc("officialTemplates/draft").set({ published: false, category: "outdoor" });
      await db.doc("officialTemplates/draft/items/water").set({ sortOrder: 1000 });
      await db.doc(`users/${MYSELF}/myTemplates/t1`).set(myTemplate());
    });
  });

  it("does not let a signed-out visitor read official templates", async () => {
    await assertFails(testEnv.unauthenticatedContext().firestore().doc("officialTemplates/day-hike").get());
  });

  it("lets a signed-in user read a published official template and its items", async () => {
    const db = testEnv.authenticatedContext(OTHER).firestore();
    await assertSucceeds(db.doc("officialTemplates/day-hike").get());
    await assertSucceeds(db.doc("officialTemplates/day-hike/items/water").get());
  });

  it("hides an unpublished official template and its items", async () => {
    const db = testEnv.authenticatedContext(OTHER).firestore();
    await assertFails(db.doc("officialTemplates/draft").get());
    await assertFails(db.doc("officialTemplates/draft/items/water").get());
  });

  it("never lets a client write an official template", async () => {
    const db = testEnv.authenticatedContext(OTHER).firestore();
    await assertFails(db.doc("officialTemplates/new").set({ published: true }));
    await assertFails(db.doc("officialTemplates/day-hike").update({ published: false }));
    await assertFails(db.doc("officialTemplates/day-hike/items/extra").set({ sortOrder: 1 }));
  });

  it("lets the owner read their own my-template but not someone else's", async () => {
    await assertSucceeds(testEnv.authenticatedContext(MYSELF).firestore().doc(`users/${MYSELF}/myTemplates/t1`).get());
    await assertFails(testEnv.authenticatedContext(OTHER).firestore().doc(`users/${MYSELF}/myTemplates/t1`).get());
  });

  it("does not let a client create a my-template (Functions only)", async () => {
    const db = testEnv.authenticatedContext(MYSELF).firestore();
    await assertFails(db.doc(`users/${MYSELF}/myTemplates/t2`).set(myTemplate()));
  });

  it("lets the owner rename a my-template and remove items", async () => {
    const db = testEnv.authenticatedContext(MYSELF).firestore();
    const ref = db.doc(`users/${MYSELF}/myTemplates/t1`);
    await assertSucceeds(ref.update({ title: "キャンプ(夏)", description: "夏用", updatedAt: new Date() }));
    await assertSucceeds(
      ref.update({
        items: [{ id: "a", name: "テント", quantity: null, unit: null, category: null, note: null, checked: false }],
        itemCount: 1,
        updatedAt: new Date(),
      })
    );
  });

  it("rejects adding items, an inconsistent itemCount, other fields, an empty or long title, and other people's edits", async () => {
    const mine = testEnv.authenticatedContext(MYSELF).firestore().doc(`users/${MYSELF}/myTemplates/t1`);
    const extra = { id: "c", name: "ランタン", quantity: null, unit: null, category: null, note: null, checked: false };
    const current = myTemplate().items;
    await assertFails(mine.update({ items: [...current, extra], itemCount: 3, updatedAt: new Date() }));
    await assertFails(mine.update({ items: [current[0]], itemCount: 2, updatedAt: new Date() }));
    await assertFails(mine.update({ listType: "task", updatedAt: new Date() }));
    await assertFails(mine.update({ title: "", updatedAt: new Date() }));
    await assertFails(mine.update({ title: "あ".repeat(61), updatedAt: new Date() }));
    await assertFails(
      testEnv.authenticatedContext(OTHER).firestore().doc(`users/${MYSELF}/myTemplates/t1`).update({ title: "乗っ取り" })
    );
  });

  it("rejects a description that is not a short string or null", async () => {
    const mine = testEnv.authenticatedContext(MYSELF).firestore().doc(`users/${MYSELF}/myTemplates/t1`);
    await assertFails(mine.update({ description: "あ".repeat(201), updatedAt: new Date() }));
    await assertFails(mine.update({ description: 123, updatedAt: new Date() }));
    await assertSucceeds(mine.update({ description: null, updatedAt: new Date() }));
  });

  it("lets only the owner delete a my-template", async () => {
    await assertFails(testEnv.authenticatedContext(OTHER).firestore().doc(`users/${MYSELF}/myTemplates/t1`).delete());
    await assertSucceeds(testEnv.authenticatedContext(MYSELF).firestore().doc(`users/${MYSELF}/myTemplates/t1`).delete());
  });
});

// AI-001: 生成の状態・回数はFunctionsだけが書き、本人は自分の生成結果だけを読める。
describe("ai generation", () => {
  const ME = "ai-owner";
  const OTHER = "ai-other";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc(`aiRequests/${ME}_r1`).set({ uid: ME, status: "succeeded", result: null });
      await db.doc(`aiUsage/${ME}_lifetime`).set({ count: 1 });
      await db.doc(`users/${ME}/aiState/active`).set({ requestId: "r1", since: 1 });
    });
  });

  it("lets the owner read their own request but not someone else's", async () => {
    await assertSucceeds(testEnv.authenticatedContext(ME).firestore().doc(`aiRequests/${ME}_r1`).get());
    await assertFails(testEnv.authenticatedContext(OTHER).firestore().doc(`aiRequests/${ME}_r1`).get());
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(`aiRequests/${ME}_r1`).get());
  });

  it("never lets a client write a request, usage or the active marker", async () => {
    const db = testEnv.authenticatedContext(ME).firestore();
    await assertFails(db.doc(`aiRequests/${ME}_r2`).set({ uid: ME, status: "succeeded" }));
    await assertFails(db.doc(`aiRequests/${ME}_r1`).update({ status: "failed" }));
    await assertFails(db.doc(`aiUsage/${ME}_lifetime`).set({ count: 0 }));
    await assertFails(db.doc(`users/${ME}/aiState/active`).delete());
  });

  it("does not let a client read the usage counters", async () => {
    await assertFails(testEnv.authenticatedContext(ME).firestore().doc(`aiUsage/${ME}_lifetime`).get());
  });

  it("lets the owner keep a generation profile, and no one else touch it", async () => {
    const mine = testEnv.authenticatedContext(ME).firestore().doc(`users/${ME}/generationProfiles/default`);
    await assertSucceeds(mine.set({ useCase: "hiking", adults: 2 }));
    await assertSucceeds(mine.get());
    await assertFails(testEnv.authenticatedContext(OTHER).firestore().doc(`users/${ME}/generationProfiles/default`).get());
    await assertFails(testEnv.authenticatedContext(OTHER).firestore().doc(`users/${ME}/generationProfiles/default`).set({ x: 1 }));
  });
});
