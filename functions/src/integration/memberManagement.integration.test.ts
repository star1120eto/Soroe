import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  leaveListTransaction,
  removeMemberTransaction,
  transferOwnershipTransaction,
} from "../lists/memberManagement";
import { clearEmulator, connectEmulator } from "./emulator";

// SHARE-004「メンバー削除、編集者の退出、所有権移譲。最後のownerは退出できず、
// 権限喪失後は購読できない」のサーバー側の検証。
const PROJECT_ID = "soroe-it-member-management";
const LIST_ID = "list-1";
const OWNER = "owner-uid";
const EDITOR = "editor-uid";
const EDITOR_2 = "editor-2-uid";

let db: Firestore;

beforeAll(() => {
  db = connectEmulator(PROJECT_ID);
});

async function seedListWithMembers(memberCount = 3) {
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
  });
  const members: [string, "owner" | "editor"][] = [
    [OWNER, "owner"],
    [EDITOR, "editor"],
    [EDITOR_2, "editor"],
  ];
  for (const [uid, role] of members.slice(0, memberCount)) {
    await db.doc(`lists/${LIST_ID}/members/${uid}`).set({ role, joinedAt: now, displayName: uid });
    await db.doc(`users/${uid}/listRefs/${LIST_ID}`).set({
      name: "今週の買い物",
      role,
      memberCount,
      totalCount: 0,
      completedCount: 0,
      archivedAt: null,
      deletedAt: null,
    });
  }
}

const exists = async (path: string) => (await db.doc(path).get()).exists;
const listRefOf = async (uid: string) => (await db.doc(`users/${uid}/listRefs/${LIST_ID}`).get()).data();

beforeEach(async () => {
  await clearEmulator(PROJECT_ID);
  await seedListWithMembers();
});

describe("removeMemberTransaction", () => {
  it("removes the member and their listRef and updates the remaining members' counts", async () => {
    await expect(removeMemberTransaction(OWNER, LIST_ID, EDITOR)).resolves.toBe("ok");

    expect(await exists(`lists/${LIST_ID}/members/${EDITOR}`)).toBe(false);
    expect(await exists(`users/${EDITOR}/listRefs/${LIST_ID}`)).toBe(false);
    expect((await listRefOf(OWNER))?.memberCount).toBe(2);
    expect((await listRefOf(EDITOR_2))?.memberCount).toBe(2);
  });

  it("only the owner can remove members", async () => {
    await expect(removeMemberTransaction(EDITOR, LIST_ID, EDITOR_2)).resolves.toBe("forbidden");
    await expect(removeMemberTransaction("stranger", LIST_ID, EDITOR_2)).resolves.toBe("forbidden");
    expect(await exists(`lists/${LIST_ID}/members/${EDITOR_2}`)).toBe(true);
  });

  it("cannot remove someone who is not a member", async () => {
    await expect(removeMemberTransaction(OWNER, LIST_ID, "stranger")).resolves.toBe("target-not-member");
  });

  it("cannot remove the owner (the last owner can never leave)", async () => {
    await expect(removeMemberTransaction(OWNER, LIST_ID, OWNER)).resolves.toBe("owner-cannot-leave");
    expect(await exists(`lists/${LIST_ID}/members/${OWNER}`)).toBe(true);
  });

  it("reports not-found for a missing list", async () => {
    await expect(removeMemberTransaction(OWNER, "missing", EDITOR)).resolves.toBe("not-found");
  });
});

describe("leaveListTransaction", () => {
  it("lets an editor leave, with the same cleanup as a removal", async () => {
    await expect(leaveListTransaction(EDITOR, LIST_ID)).resolves.toBe("ok");

    expect(await exists(`lists/${LIST_ID}/members/${EDITOR}`)).toBe(false);
    expect(await exists(`users/${EDITOR}/listRefs/${LIST_ID}`)).toBe(false);
    expect((await listRefOf(OWNER))?.memberCount).toBe(2);
  });

  it("does not let the owner leave", async () => {
    await expect(leaveListTransaction(OWNER, LIST_ID)).resolves.toBe("owner-cannot-leave");

    expect(await exists(`lists/${LIST_ID}/members/${OWNER}`)).toBe(true);
    expect((await listRefOf(OWNER))?.memberCount).toBe(3);
  });

  it("is idempotent: leaving again, or leaving a list you were never in, succeeds without changes", async () => {
    await leaveListTransaction(EDITOR, LIST_ID);

    await expect(leaveListTransaction(EDITOR, LIST_ID)).resolves.toBe("ok");
    await expect(leaveListTransaction("stranger", LIST_ID)).resolves.toBe("ok");
    await expect(leaveListTransaction(EDITOR, "missing")).resolves.toBe("ok");
    expect((await listRefOf(OWNER))?.memberCount).toBe(2);
  });
});

describe("transferOwnershipTransaction", () => {
  it("atomically swaps owner and editor on the list, the members and both listRefs", async () => {
    await expect(transferOwnershipTransaction(OWNER, LIST_ID, EDITOR)).resolves.toBe("ok");

    expect((await db.doc(`lists/${LIST_ID}`).get()).data()?.ownerId).toBe(EDITOR);
    expect((await db.doc(`lists/${LIST_ID}/members/${EDITOR}`).get()).data()?.role).toBe("owner");
    expect((await db.doc(`lists/${LIST_ID}/members/${OWNER}`).get()).data()?.role).toBe("editor");
    expect((await listRefOf(EDITOR))?.role).toBe("owner");
    expect((await listRefOf(OWNER))?.role).toBe("editor");
    expect((await db.doc(`lists/${LIST_ID}/members/${EDITOR_2}`).get()).data()?.role).toBe("editor");
  });

  it("only the current owner can transfer", async () => {
    await expect(transferOwnershipTransaction(EDITOR, LIST_ID, EDITOR_2)).resolves.toBe("forbidden");
    await expect(transferOwnershipTransaction("stranger", LIST_ID, EDITOR)).resolves.toBe("forbidden");
    expect((await db.doc(`lists/${LIST_ID}`).get()).data()?.ownerId).toBe(OWNER);
  });

  it("cannot transfer to yourself or to a non-member", async () => {
    await expect(transferOwnershipTransaction(OWNER, LIST_ID, OWNER)).resolves.toBe("invalid-target");
    await expect(transferOwnershipTransaction(OWNER, LIST_ID, "stranger")).resolves.toBe("target-not-member");
    expect((await db.doc(`lists/${LIST_ID}`).get()).data()?.ownerId).toBe(OWNER);
  });

  it("refuses a deleted list and reports a missing one", async () => {
    await db.doc(`lists/${LIST_ID}`).update({ archivedAt: Timestamp.now(), deletedAt: Timestamp.now() });
    await expect(transferOwnershipTransaction(OWNER, LIST_ID, EDITOR)).resolves.toBe("already-deleted");
    await expect(transferOwnershipTransaction(OWNER, "missing", EDITOR)).resolves.toBe("not-found");
  });

  it("makes the former owner an ordinary editor who can leave, while the new owner cannot", async () => {
    await transferOwnershipTransaction(OWNER, LIST_ID, EDITOR);

    await expect(leaveListTransaction(EDITOR, LIST_ID)).resolves.toBe("owner-cannot-leave");
    await expect(leaveListTransaction(OWNER, LIST_ID)).resolves.toBe("ok");
    await expect(removeMemberTransaction(OWNER, LIST_ID, EDITOR_2)).resolves.toBe("forbidden");
    await expect(removeMemberTransaction(EDITOR, LIST_ID, EDITOR_2)).resolves.toBe("ok");
  });
});
