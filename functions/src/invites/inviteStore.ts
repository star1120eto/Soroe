import { FieldValue, getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import type { AcceptInviteResponse, InvitePreviewResponse } from "@soroe/shared";

import { isJoinBlockedByLimit, readMemberAddState, writeMemberAdd } from "../lists/memberStore";
import type { Plan } from "../lists/listLimit";
import { classifyInvite, computeInviteExpiry, type InviteRecord } from "./inviteStatus";

// invites/{tokenHash}: 招待トークンの平文は保存せず、ドキュメントIDをSHA-256とする。
// 作成・取消・受諾の検証はすべてAdmin SDK(Callable Functions)で行い、Rulesは
// オーナーの読取以外を全て拒否している(firestore.rules)。

function toInviteRecord(data: DocumentData): InviteRecord {
  return {
    listId: data.listId as string,
    inviterId: data.inviterId as string,
    status: data.status as "active" | "revoked",
    expiresAtMs: (data.expiresAt as Timestamp).toMillis(),
  };
}

export type CreateInviteResult =
  | { status: "created" | "reused"; inviteId: string; expiresAtMs: number }
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "list-unavailable" }
  | { status: "token-conflict" };

/**
 * 招待リンクの発行。1リストの有効な招待は常に高々1本で、新しく発行すると同じ
 * transaction内で以前の有効な招待を取り消す。トークン(のハッシュ)が冪等性キーを
 * 兼ねる: 同じトークンの再送は新規作成も取消もせず、最初の結果を返す。
 */
export async function createInviteTransaction(
  uid: string,
  listId: string,
  tokenHash: string,
  nowMs: number
): Promise<CreateInviteResult> {
  const db = getFirestore();
  const listRef = db.collection("lists").doc(listId);
  const inviteRef = db.collection("invites").doc(tokenHash);
  const activeInvitesQuery = db
    .collection("invites")
    .where("listId", "==", listId)
    .where("status", "==", "active");

  return db.runTransaction(async (tx) => {
    const [listSnap, inviteSnap, activeSnap] = await Promise.all([
      tx.get(listRef),
      tx.get(inviteRef),
      tx.get(activeInvitesQuery),
    ]);

    if (!listSnap.exists) {
      return { status: "not-found" as const };
    }
    const list = listSnap.data()!;
    if (list.ownerId !== uid) {
      return { status: "forbidden" as const };
    }
    if (list.deletedAt != null || list.archivedAt != null) {
      return { status: "list-unavailable" as const };
    }

    if (inviteSnap.exists) {
      const existing = toInviteRecord(inviteSnap.data()!);
      if (existing.listId === listId && existing.inviterId === uid && existing.status === "active") {
        return { status: "reused" as const, inviteId: tokenHash, expiresAtMs: existing.expiresAtMs };
      }
      // 他リスト・他人・取消済みの招待と同じトークン。上書きせず別のトークンでの再試行を促す。
      return { status: "token-conflict" as const };
    }

    const now = Timestamp.fromMillis(nowMs);
    for (const previous of activeSnap.docs) {
      tx.update(previous.ref, { status: "revoked", revokedAt: now });
    }
    const expiresAtMs = computeInviteExpiry(nowMs);
    tx.set(inviteRef, {
      listId,
      inviterId: uid,
      status: "active",
      createdAt: now,
      expiresAt: Timestamp.fromMillis(expiresAtMs),
      revokedAt: null,
    });

    return { status: "created" as const, inviteId: tokenHash, expiresAtMs };
  });
}

export type RevokeInviteResult = "ok" | "not-found" | "forbidden";

/**
 * 招待の取消。権限は招待者ではなく「そのリストの現オーナー」で判定する
 * (所有権移譲後は新オーナーが取り消せる)。取消済みへの再送は冪等に成功する。
 */
export async function revokeInviteTransaction(
  uid: string,
  inviteId: string,
  nowMs: number
): Promise<RevokeInviteResult> {
  const db = getFirestore();
  const inviteRef = db.collection("invites").doc(inviteId);

  return db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) {
      return "not-found";
    }
    const invite = inviteSnap.data()!;
    const listSnap = await tx.get(db.collection("lists").doc(invite.listId as string));
    if (!listSnap.exists) {
      return "not-found";
    }
    if (listSnap.data()!.ownerId !== uid) {
      return "forbidden";
    }
    if (invite.status === "revoked") {
      return "ok";
    }

    tx.update(inviteRef, { status: "revoked", revokedAt: Timestamp.fromMillis(nowMs) });
    return "ok";
  });
}

/**
 * 招待プレビュー(未認証でも呼べる)。リスト名・招待者名・メンバー数だけを返し、
 * 項目の内容は返さない。使えない招待は理由だけを返し、リストの詳細は伏せる。
 */
export async function getInvitePreview(tokenHash: string, nowMs: number): Promise<InvitePreviewResponse> {
  const db = getFirestore();
  const inviteSnap = await db.collection("invites").doc(tokenHash).get();
  const invite = inviteSnap.exists ? toInviteRecord(inviteSnap.data()!) : undefined;

  const listSnap = invite ? await db.collection("lists").doc(invite.listId).get() : undefined;
  const list = listSnap?.exists ? listSnap.data()! : undefined;

  const unavailable = classifyInvite(invite, list, nowMs);
  if (unavailable !== null) {
    return { status: unavailable };
  }

  const [inviterSnap, memberCountSnap] = await Promise.all([
    db.collection("users").doc(invite!.inviterId).get(),
    // 件数だけが要るので、全メンバー分のドキュメントを読まず集計クエリで数える。
    db.collection("lists").doc(invite!.listId).collection("members").count().get(),
  ]);
  const inviterName = inviterSnap.data()?.displayName;

  return {
    status: "valid",
    listName: list!.name as string,
    inviterName: typeof inviterName === "string" && inviterName.trim() !== "" ? inviterName : null,
    memberCount: memberCountSnap.data().count,
    expiresAt: invite!.expiresAtMs,
  };
}

/**
 * 招待の受諾。検証(期限・取消・削除・自分の招待・既参加・Free上限)と参加確定を
 * 1つのtransactionで行う。招待リンクは期限内なら複数人が使える。
 * requestIdは成功時だけ記録する(拒否理由は状況が変われば再送で結果が変わって
 * よいため。例: 既存リストをアーカイブした後の再試行)。
 */
export async function acceptInviteTransaction(
  uid: string,
  displayName: string | null,
  tokenHash: string,
  requestId: string,
  plan: Plan,
  nowMs: number
): Promise<AcceptInviteResponse> {
  const db = getFirestore();
  const requestRef = db.collection("users").doc(uid).collection("acceptInviteRequests").doc(requestId);
  const inviteRef = db.collection("invites").doc(tokenHash);

  return db.runTransaction(async (tx) => {
    // Firestoreのtransactionはread-then-writeが必須。読み取りを先に終える。
    const [requestSnap, inviteSnap] = await Promise.all([tx.get(requestRef), tx.get(inviteRef)]);
    if (requestSnap.exists) {
      return { status: "joined" as const, listId: requestSnap.data()!.listId as string };
    }

    const invite = inviteSnap.exists ? toInviteRecord(inviteSnap.data()!) : undefined;
    const state = invite ? await readMemberAddState(tx, db, invite.listId, uid) : null;

    const unavailable = classifyInvite(invite, state?.list, nowMs);
    if (unavailable !== null) {
      return { status: unavailable };
    }
    // classifyInviteがnullなら招待もリストも存在する。
    const { listId, inviterId } = invite!;
    const memberState = state!;

    if (inviterId === uid) {
      return { status: "own-invite" as const };
    }
    if (memberState.memberExists) {
      return { status: "already-member" as const, listId };
    }
    if (isJoinBlockedByLimit(memberState, plan)) {
      return { status: "limit-reached" as const };
    }

    writeMemberAdd(tx, db, listId, uid, "editor", displayName, memberState);
    tx.set(requestRef, { listId, createdAt: FieldValue.serverTimestamp() });
    return { status: "joined" as const, listId };
  });
}
