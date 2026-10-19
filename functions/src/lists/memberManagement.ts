import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
  type Transaction,
} from "firebase-admin/firestore";

// SHARE-004: メンバー削除・退出・所有権移譲。members/listRefs/memberCountを
// 1つのtransactionで更新する(listRefsはclientから書けないため、ここが唯一の経路)。
// 権限喪失は members/{uid} の削除で即時に効く: Rulesのisメンバー判定がこの
// ドキュメントの存在を見るので、削除した瞬間に購読中の端末もpermission-deniedになる。

export type RemoveMemberResult =
  | "ok"
  | "not-found"
  | "forbidden"
  | "target-not-member"
  | "owner-cannot-leave";

export type LeaveListResult = "ok" | "owner-cannot-leave";

function removeMemberWrites(
  tx: Transaction,
  db: Firestore,
  listId: string,
  targetUid: string,
  membersSnap: QuerySnapshot<DocumentData>
): void {
  const remaining = membersSnap.docs.filter((doc) => doc.id !== targetUid);

  tx.delete(db.collection("lists").doc(listId).collection("members").doc(targetUid));
  tx.delete(db.collection("users").doc(targetUid).collection("listRefs").doc(listId));
  for (const member of remaining) {
    // updateでなくmerge:trueのsetにしているのは、対象のlistRefが万一欠けていても
    // transaction全体を巻き込んで失敗させないため。
    tx.set(
      db.collection("users").doc(member.id).collection("listRefs").doc(listId),
      { memberCount: remaining.length },
      { merge: true }
    );
  }
}

/** オーナーが編集者を削除する。オーナー自身は削除できない(最後のownerは残る)。 */
export async function removeMemberTransaction(
  actorUid: string,
  listId: string,
  targetUid: string
): Promise<RemoveMemberResult> {
  const db = getFirestore();
  const listRef = db.collection("lists").doc(listId);

  return db.runTransaction(async (tx) => {
    const [listSnap, membersSnap] = await Promise.all([tx.get(listRef), tx.get(listRef.collection("members"))]);
    if (!listSnap.exists) {
      return "not-found";
    }
    if (listSnap.data()!.ownerId !== actorUid) {
      return "forbidden";
    }
    if (targetUid === actorUid) {
      return "owner-cannot-leave";
    }
    if (!membersSnap.docs.some((doc) => doc.id === targetUid)) {
      return "target-not-member";
    }

    removeMemberWrites(tx, db, listId, targetUid, membersSnap);
    return "ok";
  });
}

/**
 * 編集者が自分で退出する。オーナーは退出できず、先に所有権を移譲するか
 * リストを削除する。退出済み・元々メンバーでない場合は、再送に対して
 * 冪等に成功する(結果は「このリストのメンバーではない」状態で同じ)。
 */
export async function leaveListTransaction(uid: string, listId: string): Promise<LeaveListResult> {
  const db = getFirestore();
  const listRef = db.collection("lists").doc(listId);

  return db.runTransaction(async (tx) => {
    const [listSnap, membersSnap] = await Promise.all([tx.get(listRef), tx.get(listRef.collection("members"))]);
    if (!listSnap.exists || !membersSnap.docs.some((doc) => doc.id === uid)) {
      return "ok";
    }
    if (listSnap.data()!.ownerId === uid) {
      return "owner-cannot-leave";
    }

    removeMemberWrites(tx, db, listId, uid, membersSnap);
    return "ok";
  });
}

export type TransferOwnershipResult =
  | "ok"
  | "not-found"
  | "forbidden"
  | "already-deleted"
  | "invalid-target"
  | "target-not-member";

/**
 * 所有権を現在の編集者1名へ移譲する。list.ownerId・両者のmembers.role・両者の
 * listRefs.roleを同じtransactionで入れ替え、オーナーが不在・重複する窓を作らない。
 */
export async function transferOwnershipTransaction(
  actorUid: string,
  listId: string,
  newOwnerUid: string
): Promise<TransferOwnershipResult> {
  const db = getFirestore();
  const listRef = db.collection("lists").doc(listId);

  return db.runTransaction(async (tx) => {
    const [listSnap, targetMemberSnap] = await Promise.all([
      tx.get(listRef),
      tx.get(listRef.collection("members").doc(newOwnerUid)),
    ]);
    if (!listSnap.exists) {
      return "not-found";
    }
    const list = listSnap.data()!;
    if (list.ownerId !== actorUid) {
      return "forbidden";
    }
    if (list.deletedAt != null) {
      return "already-deleted";
    }
    if (newOwnerUid === actorUid) {
      return "invalid-target";
    }
    if (!targetMemberSnap.exists) {
      return "target-not-member";
    }

    const now = FieldValue.serverTimestamp();
    tx.update(listRef, { ownerId: newOwnerUid, updatedAt: now });
    tx.update(listRef.collection("members").doc(actorUid), { role: "editor" });
    tx.update(listRef.collection("members").doc(newOwnerUid), { role: "owner" });
    tx.set(db.collection("users").doc(actorUid).collection("listRefs").doc(listId), { role: "editor" }, { merge: true });
    tx.set(
      db.collection("users").doc(newOwnerUid).collection("listRefs").doc(listId),
      { role: "owner" },
      { merge: true }
    );
    return "ok";
  });
}
