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
