import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type { ListRole } from "@soroe/shared";

import { isUnderActiveListLimit, type Plan } from "./listLimit";

export type AddMemberResult =
  | { status: "added" }
  | { status: "already-member" }
  | { status: "limit-reached" }
  | { status: "not-found" };

// メンバー追加に必要な読み取り結果。Firestoreのtransactionはread-then-writeが
// 必須のため、呼び出し元(acceptInviteなど)が自分の検証用の読み取りと合わせて
// 全てのreadを終えてからwriteMemberAddへ進めるよう、読みと書きを分けている。
export type MemberAddState = {
  list: DocumentData;
  memberExists: boolean;
  memberUids: string[];
  ownerListRef: DocumentData | undefined;
  joinerActiveListCount: number;
};

export async function readMemberAddState(
  tx: Transaction,
  db: Firestore,
  listId: string,
  uid: string
): Promise<MemberAddState | null> {
  const listRef = db.collection("lists").doc(listId);
  const joinerRef = db.collection("users").doc(uid);

  const [listSnap, memberSnap, membersSnap, joinerActiveSnap] = await Promise.all([
    tx.get(listRef),
    tx.get(listRef.collection("members").doc(uid)),
    tx.get(listRef.collection("members")),
    tx.get(joinerRef.collection("listRefs").where("archivedAt", "==", null)),
  ]);
  if (!listSnap.exists) {
    return null;
  }
  const list = listSnap.data()!;
  const ownerListRefSnap = await tx.get(
    db.collection("users").doc(list.ownerId as string).collection("listRefs").doc(listId)
  );

  return {
    list,
    memberExists: memberSnap.exists,
    memberUids: membersSnap.docs.map((doc) => doc.id),
    ownerListRef: ownerListRefSnap.data(),
    joinerActiveListCount: joinerActiveSnap.size,
  };
}

export function isJoinBlockedByLimit(state: MemberAddState, plan: Plan): boolean {
  return !isUnderActiveListLimit(state.joinerActiveListCount, plan);
}

export function writeMemberAdd(
  tx: Transaction,
  db: Firestore,
  listId: string,
  uid: string,
  role: ListRole,
  displayName: string | null,
  state: MemberAddState
): void {
  const listRef = db.collection("lists").doc(listId);
  const now = FieldValue.serverTimestamp();
  const newMemberCount = state.memberUids.length + 1;

  tx.set(listRef.collection("members").doc(uid), { role, joinedAt: now, displayName });
  tx.set(db.collection("users").doc(uid).collection("listRefs").doc(listId), {
    name: state.list.name,
    type: state.list.type,
    color: state.list.color,
    icon: state.list.icon,
    role,
    // 参加直後の初期表示用に既存の集計値を引き継ぐ。以降はsyncListItemCountsが
    // 項目の変更ごとに全メンバー分を上書きする。
    totalCount: state.ownerListRef?.totalCount ?? 0,
    completedCount: state.ownerListRef?.completedCount ?? 0,
    memberCount: newMemberCount,
    updatedAt: now,
    archivedAt: state.list.archivedAt ?? null,
    deletedAt: state.list.deletedAt ?? null,
  });
  // 既存メンバー全員のmemberCountも同じtransactionで更新する。updateでなく
  // merge:trueのsetにしているのは、対象のlistRefが万一欠けていても
  // transaction全体を巻き込んで失敗させないため。
  for (const memberUid of state.memberUids) {
    tx.set(
      db.collection("users").doc(memberUid).collection("listRefs").doc(listId),
      { memberCount: newMemberCount },
      { merge: true }
    );
  }
}

// 招待受諾(acceptInvite)など、検証を済ませた呼び出し元から使う。クライアントが
// 直接メンバーを増やせないこと(Rules)と対になる、メンバー追加の唯一の経路。
// 冪等性は「既にメンバーか」で判定する: 同一ユーザーが二重に参加しようとしても
// 新しい状態を作らない。Free上限判定は、チェックと参加確定の間に別の参加が
// 割り込むレースを避けるため、参加確定と同じtransaction内で行う。
export async function addMemberTransaction(
  listId: string,
  uid: string,
  role: ListRole,
  plan: Plan,
  displayName: string | null
): Promise<AddMemberResult> {
  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const state = await readMemberAddState(tx, db, listId, uid);
    if (state === null) {
      return { status: "not-found" as const };
    }
    if (state.memberExists) {
      return { status: "already-member" as const };
    }
    if (isJoinBlockedByLimit(state, plan)) {
      return { status: "limit-reached" as const };
    }

    writeMemberAdd(tx, db, listId, uid, role, displayName, state);
    return { status: "added" as const };
  });
}
