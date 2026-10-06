import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { INVITE_EXPIRY_MS, MAX_ACTIVE_INVITES_PER_LIST } from "../invites/inviteStatus";
import {
  acceptInviteTransaction,
  createInviteTransaction,
  getInvitePreview,
  revokeInviteTransaction,
} from "../invites/inviteStore";
import { hashInviteToken } from "../invites/token";
import { clearEmulator, connectEmulator } from "./emulator";

// SHARE-002「トークンは乱数+ハッシュ、期限7日、requestId冪等、既参加、自分招待、
// 削除済み、Free上限を検証する」の検証。
const PROJECT_ID = "soroe-it-invite-store";
const LIST_ID = "list-1";
const OWNER = "owner-uid";
const EDITOR = "editor-uid";
const JOINER = "joiner-uid";
const NOW = Date.UTC(2026, 9, 7, 0, 0, 0);

const TOKEN = "a".repeat(64);
const TOKEN_HASH = hashInviteToken(TOKEN);
const OTHER_TOKEN = "b".repeat(64);

let db: Firestore;

beforeAll(() => {
  db = connectEmulator(PROJECT_ID);
});

async function seedList(listId = LIST_ID, overrides: Record<string, unknown> = {}) {
  const now = Timestamp.fromMillis(NOW);
  await db.doc(`lists/${listId}`).set({
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
  await db.doc(`lists/${listId}/members/${OWNER}`).set({ role: "owner", joinedAt: now, displayName: "たろう" });
  await db.doc(`users/${OWNER}/listRefs/${listId}`).set({
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

async function seedInvite(
  tokenHash = TOKEN_HASH,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  await db.doc(`invites/${tokenHash}`).set({
    listId: LIST_ID,
    inviterId: OWNER,
    status: "active",
    createdAt: Timestamp.fromMillis(NOW),
    expiresAt: Timestamp.fromMillis(NOW + INVITE_EXPIRY_MS),
    revokedAt: null,
    acceptedBy: null,
    acceptedAt: null,
    ...overrides,
  });
}

async function memberDoc(uid: string, listId = LIST_ID) {
  return db.doc(`lists/${listId}/members/${uid}`).get();
}

beforeEach(async () => {
  await clearEmulator(PROJECT_ID);
  await db.doc(`users/${OWNER}`).set({ displayName: "たろう" });
  await seedList();
});

describe("createInviteTransaction", () => {
  it("stores only the token hash, with a 7-day expiry", async () => {
    const result = await createInviteTransaction(OWNER, LIST_ID, TOKEN_HASH, NOW);

    expect(result).toEqual({
      status: "created",
      inviteId: TOKEN_HASH,
      expiresAtMs: NOW + INVITE_EXPIRY_MS,
    });
    const snap = await db.doc(`invites/${TOKEN_HASH}`).get();
    expect(snap.data()).toMatchObject({
      listId: LIST_ID,
      inviterId: OWNER,
      status: "active",
      revokedAt: null,
      acceptedBy: null,
      acceptedAt: null,
    });
    expect((snap.data()!.expiresAt as Timestamp).toMillis()).toBe(NOW + INVITE_EXPIRY_MS);
    // 平文トークンはどのフィールドにも・IDにも残らない。
    expect(JSON.stringify(snap.data())).not.toContain(TOKEN);
    expect(snap.id).not.toContain(TOKEN);
  });

  it("keeps earlier links valid: one single-use link is issued per recipient", async () => {
    await createInviteTransaction(OWNER, LIST_ID, TOKEN_HASH, NOW);
    await createInviteTransaction(OWNER, LIST_ID, hashInviteToken(OTHER_TOKEN), NOW + 1000);

    expect((await db.doc(`invites/${TOKEN_HASH}`).get()).data()?.status).toBe("active");
    expect((await db.doc(`invites/${hashInviteToken(OTHER_TOKEN)}`).get()).data()?.status).toBe("active");
    const active = await db.collection("invites").where("listId", "==", LIST_ID).where("status", "==", "active").get();
    expect(active.size).toBe(2);
  });

  it("refuses a new link once the cap of outstanding links is reached", async () => {
    for (let i = 0; i < MAX_ACTIVE_INVITES_PER_LIST; i++) {
      await seedInvite(hashInviteToken(`${i}`.padStart(64, "c")));
    }

    const result = await createInviteTransaction(OWNER, LIST_ID, TOKEN_HASH, NOW);

    expect(result).toEqual({ status: "too-many-active" });
    expect((await db.doc(`invites/${TOKEN_HASH}`).get()).exists).toBe(false);
  });

  it("does not count expired, revoked or used links toward the cap", async () => {
    for (let i = 0; i < MAX_ACTIVE_INVITES_PER_LIST; i++) {
      const hash = hashInviteToken(`${i}`.padStart(64, "d"));
      if (i % 3 === 0) await seedInvite(hash, { expiresAt: Timestamp.fromMillis(NOW - 1) });
      else if (i % 3 === 1) await seedInvite(hash, { status: "revoked" });
      else await seedInvite(hash, { status: "accepted", acceptedBy: "someone" });
    }

    await expect(createInviteTransaction(OWNER, LIST_ID, TOKEN_HASH, NOW)).resolves.toMatchObject({
      status: "created",
    });
  });

  it("is idempotent for the same token: it reuses the invite and revokes nothing", async () => {
    const first = await createInviteTransaction(OWNER, LIST_ID, TOKEN_HASH, NOW);
    const second = await createInviteTransaction(OWNER, LIST_ID, TOKEN_HASH, NOW + 5000);

    expect(first.status).toBe("created");
    expect(second).toEqual({ status: "reused", inviteId: TOKEN_HASH, expiresAtMs: NOW + INVITE_EXPIRY_MS });
    expect((await db.doc(`invites/${TOKEN_HASH}`).get()).data()?.status).toBe("active");
  });

  it("rejects a token already used by another list's invite without touching it", async () => {
    await seedList("list-2");
    await seedInvite(TOKEN_HASH, { listId: "list-2" });

    const result = await createInviteTransaction(OWNER, LIST_ID, TOKEN_HASH, NOW);

    expect(result).toEqual({ status: "token-conflict" });
    expect((await db.doc(`invites/${TOKEN_HASH}`).get()).data()?.listId).toBe("list-2");
  });

  it("refuses an editor and a non-member (only the owner can invite)", async () => {
    await db.doc(`lists/${LIST_ID}/members/${EDITOR}`).set({ role: "editor", joinedAt: Timestamp.now() });

    await expect(createInviteTransaction(EDITOR, LIST_ID, TOKEN_HASH, NOW)).resolves.toEqual({ status: "forbidden" });
    await expect(createInviteTransaction("stranger", LIST_ID, TOKEN_HASH, NOW)).resolves.toEqual({
      status: "forbidden",
    });
    expect((await db.doc(`invites/${TOKEN_HASH}`).get()).exists).toBe(false);
  });

  it("reports not-found for a missing list", async () => {
    await expect(createInviteTransaction(OWNER, "missing", TOKEN_HASH, NOW)).resolves.toEqual({
      status: "not-found",
    });
  });

  it("refuses archived and deleted lists", async () => {
    await db.doc(`lists/${LIST_ID}`).update({ archivedAt: Timestamp.now() });
    await expect(createInviteTransaction(OWNER, LIST_ID, TOKEN_HASH, NOW)).resolves.toEqual({
      status: "list-unavailable",
    });

    await db.doc(`lists/${LIST_ID}`).update({ deletedAt: Timestamp.now() });
    await expect(createInviteTransaction(OWNER, LIST_ID, TOKEN_HASH, NOW)).resolves.toEqual({
      status: "list-unavailable",
    });
  });
});

describe("revokeInviteTransaction", () => {
  beforeEach(async () => {
    await seedInvite();
  });

  it("lets the owner revoke, and is idempotent", async () => {
    await expect(revokeInviteTransaction(OWNER, TOKEN_HASH, NOW)).resolves.toBe("ok");
    const data = (await db.doc(`invites/${TOKEN_HASH}`).get()).data();
    expect(data?.status).toBe("revoked");
    expect((data?.revokedAt as Timestamp).toMillis()).toBe(NOW);

    await expect(revokeInviteTransaction(OWNER, TOKEN_HASH, NOW + 1000)).resolves.toBe("ok");
    expect(((await db.doc(`invites/${TOKEN_HASH}`).get()).data()?.revokedAt as Timestamp).toMillis()).toBe(NOW);
  });

  it("leaves a link that was already used as it is (nothing left to revoke)", async () => {
    await db.doc(`invites/${TOKEN_HASH}`).update({ status: "accepted", acceptedBy: JOINER });

    await expect(revokeInviteTransaction(OWNER, TOKEN_HASH, NOW)).resolves.toBe("ok");

    expect((await db.doc(`invites/${TOKEN_HASH}`).get()).data()).toMatchObject({ status: "accepted", revokedAt: null });
  });

  it("refuses non-owners", async () => {
    await db.doc(`lists/${LIST_ID}/members/${EDITOR}`).set({ role: "editor", joinedAt: Timestamp.now() });

    await expect(revokeInviteTransaction(EDITOR, TOKEN_HASH, NOW)).resolves.toBe("forbidden");
    expect((await db.doc(`invites/${TOKEN_HASH}`).get()).data()?.status).toBe("active");
  });

  it("reports not-found for an unknown invite", async () => {
    await expect(revokeInviteTransaction(OWNER, "nope", NOW)).resolves.toBe("not-found");
  });

  it("follows the current owner after an ownership transfer, not the original inviter", async () => {
    await db.doc(`lists/${LIST_ID}`).update({ ownerId: EDITOR });

    await expect(revokeInviteTransaction(OWNER, TOKEN_HASH, NOW)).resolves.toBe("forbidden");
    await expect(revokeInviteTransaction(EDITOR, TOKEN_HASH, NOW)).resolves.toBe("ok");
  });
});

describe("getInvitePreview", () => {
  it("returns only the list name, inviter name, member count and expiry for a valid invite", async () => {
    await seedInvite();

    const preview = await getInvitePreview(TOKEN_HASH, NOW);

    expect(preview).toEqual({
      status: "valid",
      listName: "今週の買い物",
      inviterName: "たろう",
      memberCount: 1,
      expiresAt: NOW + INVITE_EXPIRY_MS,
    });
  });

  it("counts every member, not just the owner", async () => {
    await db.doc(`lists/${LIST_ID}/members/${EDITOR}`).set({ role: "editor", joinedAt: Timestamp.now() });
    await db.doc(`lists/${LIST_ID}/members/${JOINER}`).set({ role: "editor", joinedAt: Timestamp.now() });
    await seedInvite();

    await expect(getInvitePreview(TOKEN_HASH, NOW)).resolves.toMatchObject({ status: "valid", memberCount: 3 });
  });

  it("uses a null inviter name when the inviter has no profile", async () => {
    await db.doc(`users/${OWNER}`).delete();
    await seedInvite();

    await expect(getInvitePreview(TOKEN_HASH, NOW)).resolves.toMatchObject({ status: "valid", inviterName: null });
  });

  it.each([
    ["not-found", async () => {}, TOKEN_HASH],
    ["revoked", async () => seedInvite(TOKEN_HASH, { status: "revoked" }), TOKEN_HASH],
    ["used", async () => seedInvite(TOKEN_HASH, { status: "accepted", acceptedBy: "someone" }), TOKEN_HASH],
    ["expired", async () => seedInvite(TOKEN_HASH, { expiresAt: Timestamp.fromMillis(NOW - 1) }), TOKEN_HASH],
    [
      "list-deleted",
      async () => {
        await seedInvite();
        await db.doc(`lists/${LIST_ID}`).update({ archivedAt: Timestamp.now(), deletedAt: Timestamp.now() });
      },
      TOKEN_HASH,
    ],
    [
      "list-archived",
      async () => {
        await seedInvite();
        await db.doc(`lists/${LIST_ID}`).update({ archivedAt: Timestamp.now() });
      },
      TOKEN_HASH,
    ],
  ])("reports %s with nothing else", async (status, arrange, hash) => {
    await arrange();

    await expect(getInvitePreview(hash, NOW)).resolves.toEqual({ status });
  });
});

describe("acceptInviteTransaction", () => {
  beforeEach(async () => {
    await seedInvite();
  });

  it("joins the caller as an editor and creates their listRef", async () => {
    const result = await acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW);

    expect(result).toEqual({ status: "joined", listId: LIST_ID });
    expect((await memberDoc(JOINER)).data()).toMatchObject({ role: "editor", displayName: "はなこ" });
    expect((await db.doc(`users/${JOINER}/listRefs/${LIST_ID}`).get()).data()).toMatchObject({
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
    expect((await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).get()).data()?.memberCount).toBe(2);
  });

  it("uses the link up: it cannot be used by a second person", async () => {
    await acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW);

    const invite = (await db.doc(`invites/${TOKEN_HASH}`).get()).data()!;
    expect(invite.status).toBe("accepted");
    expect(invite.acceptedBy).toBe(JOINER);
    expect((invite.acceptedAt as Timestamp).toMillis()).toBeGreaterThan(0);
    await expect(acceptInviteTransaction("third-uid", null, TOKEN_HASH, "req-2", "free", NOW)).resolves.toEqual({
      status: "used",
    });
    expect((await memberDoc("third-uid")).exists).toBe(false);
  });

  it("lets several family members join, each through their own link", async () => {
    const secondHash = hashInviteToken(OTHER_TOKEN);
    await seedInvite(secondHash);

    await acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW);
    await acceptInviteTransaction("third-uid", null, secondHash, "req-2", "free", NOW);

    for (const uid of [OWNER, JOINER, "third-uid"]) {
      expect((await db.doc(`users/${uid}/listRefs/${LIST_ID}`).get()).data()?.memberCount).toBe(3);
    }
  });

  it("opens the list when the person who used the link opens it again while still a member", async () => {
    await acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW);

    await expect(acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-2", "free", NOW)).resolves.toEqual({
      status: "already-member",
      listId: LIST_ID,
    });
  });

  it("does not let a removed member back in with the link they already used", async () => {
    await acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW);
    await db.doc(`lists/${LIST_ID}/members/${JOINER}`).delete();
    await db.doc(`users/${JOINER}/listRefs/${LIST_ID}`).delete();

    await expect(acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-2", "free", NOW)).resolves.toEqual({
      status: "used",
    });
    expect((await memberDoc(JOINER)).exists).toBe(false);
  });

  it("lets only one of two people racing for the same link join", async () => {
    const results = await Promise.all([
      acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-a", "free", NOW),
      acceptInviteTransaction("third-uid", "じろう", TOKEN_HASH, "req-b", "free", NOW),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(["joined", "used"]);
    expect((await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).get()).data()?.memberCount).toBe(2);
  });

  it("does not use up the link when the join is blocked by the Free limit", async () => {
    for (let i = 0; i < 3; i++) {
      await db.doc(`users/${JOINER}/listRefs/other-${i}`).set({ name: `他${i}`, role: "owner", archivedAt: null });
    }

    await expect(acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW)).resolves.toEqual({
      status: "limit-reached",
    });
    expect((await db.doc(`invites/${TOKEN_HASH}`).get()).data()?.status).toBe("active");
  });

  it("returns already-member (so the app can open the list) when the caller already joined", async () => {
    await db.doc(`lists/${LIST_ID}/members/${EDITOR}`).set({ role: "editor", joinedAt: Timestamp.now() });

    await expect(acceptInviteTransaction(EDITOR, "x", TOKEN_HASH, "req-1", "free", NOW)).resolves.toEqual({
      status: "already-member",
      listId: LIST_ID,
    });
  });

  it("rejects the inviter's own invite", async () => {
    await expect(acceptInviteTransaction(OWNER, "たろう", TOKEN_HASH, "req-1", "free", NOW)).resolves.toEqual({
      status: "own-invite",
    });
  });

  it("replays the same requestId idempotently without adding anyone twice", async () => {
    await acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW);
    const replay = await acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW);

    expect(replay).toEqual({ status: "joined", listId: LIST_ID });
    expect((await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).get()).data()?.memberCount).toBe(2);
  });

  it("lets only one of two concurrent accepts by the same user create the membership", async () => {
    const results = await Promise.all([
      acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-a", "free", NOW),
      acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-b", "free", NOW),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(["already-member", "joined"]);
    expect((await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).get()).data()?.memberCount).toBe(2);
  });

  it.each([
    ["not-found", async () => db.doc(`invites/${TOKEN_HASH}`).delete()],
    ["revoked", async () => db.doc(`invites/${TOKEN_HASH}`).update({ status: "revoked" })],
    ["used", async () => db.doc(`invites/${TOKEN_HASH}`).update({ status: "accepted", acceptedBy: "someone-else" })],
    [
      "expired",
      async () => db.doc(`invites/${TOKEN_HASH}`).update({ expiresAt: Timestamp.fromMillis(NOW - 1) }),
    ],
    [
      "list-deleted",
      async () => db.doc(`lists/${LIST_ID}`).update({ archivedAt: Timestamp.now(), deletedAt: Timestamp.now() }),
    ],
    ["list-archived", async () => db.doc(`lists/${LIST_ID}`).update({ archivedAt: Timestamp.now() })],
  ])("refuses a %s invite and creates nothing", async (status, arrange) => {
    await arrange();

    await expect(acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW)).resolves.toEqual({
      status,
    });
    expect((await memberDoc(JOINER)).exists).toBe(false);
    expect((await db.doc(`users/${JOINER}/listRefs/${LIST_ID}`).get()).exists).toBe(false);
    expect((await db.doc(`users/${JOINER}/acceptInviteRequests/req-1`).get()).exists).toBe(false);
  });

  it("blocks a Free user who already has 3 active lists, and lets Premium through", async () => {
    for (let i = 0; i < 3; i++) {
      await db.doc(`users/${JOINER}/listRefs/other-${i}`).set({ name: `他${i}`, role: "owner", archivedAt: null });
    }

    await expect(acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW)).resolves.toEqual({
      status: "limit-reached",
    });
    expect((await memberDoc(JOINER)).exists).toBe(false);
    expect((await db.doc(`users/${JOINER}/listRefs/${LIST_ID}`).get()).exists).toBe(false);
    expect((await db.doc(`users/${OWNER}/listRefs/${LIST_ID}`).get()).data()?.memberCount).toBe(1);

    await expect(acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-2", "premium", NOW)).resolves.toEqual({
      status: "joined",
      listId: LIST_ID,
    });
  });

  it("does not count archived lists toward the Free limit", async () => {
    for (let i = 0; i < 2; i++) {
      await db.doc(`users/${JOINER}/listRefs/active-${i}`).set({ name: `他${i}`, role: "owner", archivedAt: null });
      await db.doc(`users/${JOINER}/listRefs/archived-${i}`).set({ name: `古${i}`, role: "owner", archivedAt: Timestamp.now() });
    }

    await expect(acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW)).resolves.toEqual({
      status: "joined",
      listId: LIST_ID,
    });
  });

  it("does not let two concurrent joins to different lists exceed the Free limit", async () => {
    // 2件持っている状態で、別々の2リストへ同時に参加する。transactionが直列化されるため、
    // 片方だけが成功する(合計3件で止まる)。
    for (let i = 0; i < 2; i++) {
      await db.doc(`users/${JOINER}/listRefs/other-${i}`).set({ name: `他${i}`, role: "owner", archivedAt: null });
    }
    await seedList("list-2");
    const otherToken = hashInviteToken(OTHER_TOKEN);
    await seedInvite(otherToken, { listId: "list-2" });

    const results = await Promise.all([
      acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-a", "free", NOW),
      acceptInviteTransaction(JOINER, "はなこ", otherToken, "req-b", "free", NOW),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(["joined", "limit-reached"]);
  });

  it("does not record the request when the join was blocked, so a retry after archiving can succeed", async () => {
    for (let i = 0; i < 3; i++) {
      await db.doc(`users/${JOINER}/listRefs/other-${i}`).set({ name: `他${i}`, role: "owner", archivedAt: null });
    }
    await acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW);
    await db.doc(`users/${JOINER}/listRefs/other-0`).update({ archivedAt: Timestamp.now() });

    await expect(acceptInviteTransaction(JOINER, "はなこ", TOKEN_HASH, "req-1", "free", NOW)).resolves.toEqual({
      status: "joined",
      listId: LIST_ID,
    });
  });
});
