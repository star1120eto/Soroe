import { FieldValue, getFirestore, Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import type { ListType } from "@soroe/shared";

import { FIRESTORE_BATCH_CHUNK_SIZE } from "./constants";
import { isUnderActiveListLimit, type Plan } from "./listLimit";
import { isWithinRestoreWindow } from "./retention";

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
      deletedAt: null,
    });
    tx.set(requestRef, { listId: listRef.id, createdAt: now });

    return { status: "created" as const, listId: listRef.id };
  });
}

// ---- LIST-006: 複製・アーカイブ・復元・削除 ----
// 所有権判定と(複製・アーカイブ解除・復元での)Free上限の原子的判定を
// 一つのtransactionにまとめる。firestore.rulesはarchivedAt/deletedAtの
// client直接更新を拒否しているため、これらはAdmin SDK経由に限られる。

export type OwnerActionResult = "ok" | "not-found" | "forbidden" | "already-deleted";

/** アーカイブはオーナーのみ、削除済みリストには実行できない(LIST-05)。 */
export async function archiveListTransaction(uid: string, listId: string): Promise<OwnerActionResult> {
  const db = getFirestore();
  const listRef = db.collection("lists").doc(listId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(listRef);
    if (!snap.exists) {
      return "not-found";
    }
    const data = snap.data()!;
    if (data.ownerId !== uid) {
      return "forbidden";
    }
    if (data.deletedAt !== null) {
      // 権限は問題ないが対象が既に削除済み。「オーナーだけが実行できます」
      // という誤った理由を返さないよう、forbiddenとは別のresultにする。
      return "already-deleted";
    }
    if (data.archivedAt !== null) {
      return "ok"; // 既にアーカイブ済み。再送に対して冪等。
    }

    const now = FieldValue.serverTimestamp();
    tx.update(listRef, { archivedAt: now, updatedAt: now });
    return "ok";
  });
}

/**
 * 論理削除。全メンバーから非表示にするため、アーカイブ扱いも同時に立てる
 * (一覧クエリは`archivedAt == null`だけを見るため、これで一覧から自然に消える)。
 */
export async function deleteListTransaction(uid: string, listId: string): Promise<OwnerActionResult> {
  const db = getFirestore();
  const listRef = db.collection("lists").doc(listId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(listRef);
    if (!snap.exists) {
      return "not-found";
    }
    const data = snap.data()!;
    if (data.ownerId !== uid) {
      return "forbidden";
    }
    if (data.deletedAt !== null) {
      return "ok"; // 既に削除済み。再送に対して冪等。
    }

    const now = FieldValue.serverTimestamp();
    tx.update(listRef, { archivedAt: now, deletedAt: now, updatedAt: now });
    return "ok";
  });
}

export type ReactivateListResult =
  | { status: "ok" }
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "already-deleted" }
  | { status: "expired" }
  | { status: "limit-reached" };

type ReactivateEligibility = "ok" | "already-active" | "forbidden" | "already-deleted" | "expired";

/**
 * アーカイブ解除・復元の共通処理。requestIdの冪等性とFree上限の原子的判定を行う。
 * createListTransactionに倣い、成功時だけrequestドキュメントを残す
 * (拒否理由は状況が変われば再送で結果が変わってよいため)。
 */
async function reactivateListTransaction(
  uid: string,
  requestId: string,
  listId: string,
  requestsSubcollection: string,
  plan: Plan,
  isEligible: (data: DocumentData) => ReactivateEligibility
): Promise<ReactivateListResult> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const requestRef = userRef.collection(requestsSubcollection).doc(requestId);
  const listRef = db.collection("lists").doc(listId);
  const activeListRefsQuery = userRef.collection("listRefs").where("archivedAt", "==", null);

  return db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (requestSnap.exists) {
      return { status: "ok" as const };
    }

    const listSnap = await tx.get(listRef);
    if (!listSnap.exists) {
      return { status: "not-found" as const };
    }
    const data = listSnap.data()!;
    if (data.ownerId !== uid) {
      return { status: "forbidden" as const };
    }

    const eligibility = isEligible(data);
    if (eligibility === "already-active") {
      return { status: "ok" as const };
    }
    if (eligibility !== "ok") {
      return { status: eligibility };
    }

    const activeSnap = await tx.get(activeListRefsQuery);
    if (!isUnderActiveListLimit(activeSnap.size, plan)) {
      return { status: "limit-reached" as const };
    }

    const now = FieldValue.serverTimestamp();
    tx.update(listRef, { archivedAt: null, deletedAt: null, updatedAt: now });
    tx.set(requestRef, { listId, createdAt: now });
    return { status: "ok" as const };
  });
}

export function unarchiveListTransaction(
  uid: string,
  requestId: string,
  listId: string,
  plan: Plan
): Promise<ReactivateListResult> {
  return reactivateListTransaction(uid, requestId, listId, "unarchiveListRequests", plan, (data) => {
    if (data.deletedAt !== null) {
      // 削除済みはunarchiveでなくrestoreの対象。権限は問題ないため、
      // 「オーナーだけが実行できます」という誤った理由を返さないよう
      // forbiddenとは別のresultにする(archiveListTransactionと同じ理由)。
      return "already-deleted";
    }
    if (data.archivedAt === null) {
      return "already-active";
    }
    return "ok";
  });
}

export function restoreListTransaction(
  uid: string,
  requestId: string,
  listId: string,
  plan: Plan
): Promise<ReactivateListResult> {
  return reactivateListTransaction(uid, requestId, listId, "restoreListRequests", plan, (data) => {
    if (data.deletedAt === null) {
      return "already-active";
    }
    const deletedAtMillis = (data.deletedAt as Timestamp).toMillis();
    if (!isWithinRestoreWindow(deletedAtMillis, Date.now())) {
      return "expired";
    }
    return "ok";
  });
}

export type DuplicateListResult =
  | { status: "ok"; listId: string }
  | { status: "not-found" }
  | { status: "limit-reached" };

/**
 * 複製はオーナーに限らずメンバーなら実行できる。複製先は呼び出し元uidが
 * オーナーの完全に独立したリストになり、共有関係・担当・完了状態は引き継がない。
 */
// family-checklist-product-design.md「1リストの項目数: 無制限(推奨上限500件、
// 超過時は警告)」に対応するため、項目の複製だけはtransactionの外で
// chunked batchに分けて行う(Firestoreのtransactionは1回あたり500書込までで、
// リスト・メンバー・listRef・requestの4件と合わせると500件超の複製で失敗する)。
export async function duplicateListTransaction(
  uid: string,
  requestId: string,
  sourceListId: string,
  plan: Plan
): Promise<DuplicateListResult> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const requestRef = userRef.collection("duplicateListRequests").doc(requestId);
  const sourceListRef = db.collection("lists").doc(sourceListId);
  const sourceMemberRef = sourceListRef.collection("members").doc(uid);
  const activeListRefsQuery = userRef.collection("listRefs").where("archivedAt", "==", null);

  let itemsToCopy: DocumentData[] = [];
  let newListId: string | null = null;

  const result = await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (requestSnap.exists) {
      // 冪等な再送。項目複製が前回どこまで進んだかは追跡していないため、
      // 新規作成はスキップしそのままlistIdを返す(既知の制約)。
      return { status: "ok" as const, listId: requestSnap.data()!.listId as string };
    }

    const [sourceSnap, memberSnap] = await Promise.all([tx.get(sourceListRef), tx.get(sourceMemberRef)]);
    if (!sourceSnap.exists || !memberSnap.exists) {
      return { status: "not-found" as const };
    }
    const source = sourceSnap.data()!;
    if (source.deletedAt !== null) {
      return { status: "not-found" as const };
    }

    const activeSnap = await tx.get(activeListRefsQuery);
    if (!isUnderActiveListLimit(activeSnap.size, plan)) {
      return { status: "limit-reached" as const };
    }

    const itemsSnap = await tx.get(
      sourceListRef.collection("items").where("deletedAt", "==", null).orderBy("sortOrder", "asc")
    );

    const newListRef = db.collection("lists").doc();
    const now = FieldValue.serverTimestamp();
    const copiedName = `${source.name}のコピー`.slice(0, 60);

    tx.set(newListRef, {
      name: copiedName,
      type: source.type,
      color: source.color,
      icon: source.icon,
      ownerId: uid,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    });
    tx.set(newListRef.collection("members").doc(uid), { role: "owner", joinedAt: now });
    tx.set(userRef.collection("listRefs").doc(newListRef.id), {
      name: copiedName,
      type: source.type,
      color: source.color,
      icon: source.icon,
      role: "owner",
      totalCount: itemsSnap.size,
      completedCount: 0,
      memberCount: 1,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    });
    tx.set(requestRef, { listId: newListRef.id, createdAt: now });

    itemsToCopy = itemsSnap.docs.map((doc) => doc.data());
    newListId = newListRef.id;
    return { status: "ok" as const, listId: newListRef.id };
  });

  if (result.status === "ok" && newListId) {
    await copyItemsInChunks(db, newListId, uid, itemsToCopy);
  }

  return result;
}

// 完了状態・担当者・期限は元の文脈(共有メンバーや当時の予定)に紐づくため
// 引き継がず、名前・数量・単位・カテゴリ・メモ・並び順だけを複製する。
// テストのためexportする(chunk境界の検証にtransactionの模倣までは要らない)。
export async function copyItemsInChunks(
  db: Firestore,
  newListId: string,
  uid: string,
  items: DocumentData[]
): Promise<void> {
  const itemsCollection = db.collection("lists").doc(newListId).collection("items");
  const now = FieldValue.serverTimestamp();

  for (let offset = 0; offset < items.length; offset += FIRESTORE_BATCH_CHUNK_SIZE) {
    const batch = db.batch();
    for (const item of items.slice(offset, offset + FIRESTORE_BATCH_CHUNK_SIZE)) {
      batch.set(itemsCollection.doc(), {
        name: item.name,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        category: item.category ?? null,
        note: item.note ?? null,
        assigneeId: null,
        dueAt: null,
        completedAt: null,
        completedBy: null,
        sortOrder: item.sortOrder,
        createdBy: uid,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }
    await batch.commit();
  }
}
