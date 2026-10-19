import { FieldValue, getFirestore, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import type { AiGenerationInput, AiQuota, AiRating, AiRequestStatus, AiResult, AiResultItem, ListType } from "@soroe/shared";

import { AI_ACTIVE_TTL_MS, FREE_AI_LIFETIME_LIMIT, PREMIUM_AI_MONTHLY_LIMIT } from "../lists/constants";
import { writeItemsInChunks, writeNewList, type NewItem } from "../lists/listCreation";
import { isUnderActiveListLimit, type Plan } from "../lists/listLimit";
import { jstMonthKey, nextJstMonthStartMs } from "./usagePeriod";

// AI-001: 回数の予約→生成→確定/返却の状態機械。回数はクライアントの申告を信用せず、すべて
// transactionで原子的に更新する。aiRequestsのIDは `${uid}_${requestId}`(他人のrequestIdと衝突させず、
// Rulesがuidで読取を絞れるようにする)。

export type AiRequestView = {
  status: AiRequestStatus;
  result: AiResult | null;
  message: string | null;
  listId: string | null;
};

export const aiRequestId = (uid: string, requestId: string) => `${uid}_${requestId}`;

const limitFor = (plan: Plan) => (plan === "premium" ? PREMIUM_AI_MONTHLY_LIMIT : FREE_AI_LIFETIME_LIMIT);

// Freeは生涯、Premiumは日本時間の暦月ごとに数える。予約時のキーを記録し、返却はそのキーへ戻す。
const usageKeyFor = (uid: string, plan: Plan, nowMs: number) =>
  plan === "premium" ? `${uid}_${jstMonthKey(nowMs)}` : `${uid}_lifetime`;

function quotaFrom(plan: Plan, used: number, nowMs: number): AiQuota {
  const limit = limitFor(plan);
  return {
    plan,
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    resetsAt: plan === "premium" ? nextJstMonthStartMs(nowMs) : null,
  };
}

const refs = (uid: string, requestId: string) => {
  const db = getFirestore();
  return {
    db,
    requestRef: db.collection("aiRequests").doc(aiRequestId(uid, requestId)),
    activeRef: db.collection("users").doc(uid).collection("aiState").doc("active"),
  };
};

function toView(data: FirebaseFirestore.DocumentData): AiRequestView {
  return {
    status: data.status,
    result: data.result ?? null,
    message: data.message ?? null,
    listId: data.listId ?? null,
  };
}

export type ReserveResult =
  | { status: "reserved" }
  | { status: "existing"; request: AiRequestView }
  | { status: "limit-reached"; quota: AiQuota }
  | { status: "busy" };

/**
 * 回数を予約する。同じrequestIdは消費せず現在の状態を返す。同時に生成できるのは1件で、予約から
 * AI_ACTIVE_TTL_MSを過ぎたものは失効とみなして失敗にし、回数を戻してから新しい予約を受ける。
 */
export async function reserveGenerationTransaction(
  uid: string,
  requestId: string,
  input: AiGenerationInput,
  plan: Plan,
  nowMs: number
): Promise<ReserveResult> {
  const { db, requestRef, activeRef } = refs(uid, requestId);
  const usageKey = usageKeyFor(uid, plan, nowMs);
  const usageRef = db.collection("aiUsage").doc(usageKey);

  return db.runTransaction(async (tx) => {
    // read-then-write。読み取りを先に終える。
    const [requestSnap, usageSnap, activeSnap] = await Promise.all([tx.get(requestRef), tx.get(usageRef), tx.get(activeRef)]);
    if (requestSnap.exists) {
      const existing = requestSnap.data()!;
      const active = activeSnap.data();
      const expired = active?.requestId === requestId && nowMs - (active.since as number) >= AI_ACTIVE_TTL_MS;
      if (existing.status !== "reserved" || !expired) {
        return { status: "existing" as const, request: toView(existing) };
      }
      // 同じrequestIdの再送で、失効した予約が見つかった。失敗にして回数を戻し、状態を返す。
      const ownUsageRef = db.collection("aiUsage").doc(existing.usageKey as string);
      const count = ownUsageRef.path === usageRef.path ? (usageSnap.data()?.count ?? 0) : ((await tx.get(ownUsageRef)).data()?.count ?? 0);
      const message = "生成がタイムアウトしました";
      tx.update(requestRef, { status: "failed", message, updatedAt: FieldValue.serverTimestamp() });
      tx.set(ownUsageRef, { count: Math.max(count - 1, 0) }, { merge: true });
      tx.delete(activeRef);
      return { status: "existing" as const, request: toView({ ...existing, status: "failed", message }) };
    }

    let staleRequestRef: DocumentReference | null = null;
    let staleUsageRef: DocumentReference | null = null;
    let staleUsageCount = 0;
    if (activeSnap.exists) {
      const active = activeSnap.data()!;
      if (nowMs - (active.since as number) < AI_ACTIVE_TTL_MS) {
        return { status: "busy" as const };
      }
      // 失効した予約。まだ予約中なら、失敗にして使った回数を戻す。
      const candidate = db.collection("aiRequests").doc(aiRequestId(uid, active.requestId as string));
      const candidateSnap = await tx.get(candidate);
      if (candidateSnap.exists && candidateSnap.data()!.status === "reserved") {
        staleRequestRef = candidate;
        staleUsageRef = db.collection("aiUsage").doc(candidateSnap.data()!.usageKey as string);
        staleUsageCount = staleUsageRef.path === usageRef.path ? (usageSnap.data()?.count ?? 0) : ((await tx.get(staleUsageRef)).data()?.count ?? 0);
      }
    }

    let used = usageSnap.data()?.count ?? 0;
    if (staleRequestRef && staleUsageRef) {
      tx.update(staleRequestRef, { status: "failed", message: "生成がタイムアウトしました", updatedAt: FieldValue.serverTimestamp() });
      tx.set(staleUsageRef, { count: Math.max(staleUsageCount - 1, 0) }, { merge: true });
      if (staleUsageRef.path === usageRef.path) {
        used = Math.max(used - 1, 0);
      }
    }

    if (used >= limitFor(plan)) {
      tx.delete(activeRef); // 失効した予約を片付ける(新しい予約は作らない)
      return { status: "limit-reached" as const, quota: quotaFrom(plan, used, nowMs) };
    }

    const now = FieldValue.serverTimestamp();
    tx.set(usageRef, { count: used + 1 }, { merge: true });
    tx.set(requestRef, { uid, status: "reserved", usageKey, input, result: null, message: null, listId: null, createdAt: now, updatedAt: now });
    tx.set(activeRef, { requestId, since: nowMs });
    return { status: "reserved" as const };
  });
}

export type CompleteOutcome =
  | { kind: "succeeded"; result: AiResult }
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string };

function releaseUse(tx: Transaction, usageRef: DocumentReference, currentCount: number) {
  tx.set(usageRef, { count: Math.max(currentCount - 1, 0) }, { merge: true });
}

/** 生成の結果を確定する。予約中以外(キャンセル済みなど)は何も変えず、現在の状態を返す。 */
export async function completeGenerationTransaction(
  uid: string,
  requestId: string,
  outcome: CompleteOutcome
): Promise<{ status: AiRequestStatus | "not-found" }> {
  const { db, requestRef, activeRef } = refs(uid, requestId);

  return db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) {
      return { status: "not-found" as const };
    }
    const data = requestSnap.data()!;
    if (data.status !== "reserved") {
      return { status: data.status as AiRequestStatus };
    }
    const usageRef = db.collection("aiUsage").doc(data.usageKey as string);
    const [usageSnap, activeSnap] = await Promise.all([tx.get(usageRef), tx.get(activeRef)]);

    const now = FieldValue.serverTimestamp();
    if (outcome.kind === "succeeded") {
      tx.update(requestRef, { status: "succeeded", result: outcome.result, updatedAt: now });
    } else {
      tx.update(requestRef, { status: outcome.kind, message: outcome.message, updatedAt: now });
      releaseUse(tx, usageRef, usageSnap.data()?.count ?? 0);
    }
    if (activeSnap.exists && activeSnap.data()!.requestId === requestId) {
      tx.delete(activeRef);
    }
    return { status: outcome.kind };
  });
}

/** 予約中のキャンセル。回数を戻す。完了済みは何もしない(成功後に結果を捨てても戻さない)。 */
export async function cancelGenerationTransaction(
  uid: string,
  requestId: string
): Promise<"cancelled" | "already-finished" | "not-found"> {
  const { db, requestRef, activeRef } = refs(uid, requestId);

  return db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) {
      return "not-found" as const;
    }
    const data = requestSnap.data()!;
    if (data.status !== "reserved") {
      return "already-finished" as const;
    }
    const usageRef = db.collection("aiUsage").doc(data.usageKey as string);
    const [usageSnap, activeSnap] = await Promise.all([tx.get(usageRef), tx.get(activeRef)]);

    tx.update(requestRef, { status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
    releaseUse(tx, usageRef, usageSnap.data()?.count ?? 0);
    if (activeSnap.exists && activeSnap.data()!.requestId === requestId) {
      tx.delete(activeRef);
    }
    return "cancelled" as const;
  });
}

export async function getAiQuota(uid: string, plan: Plan, nowMs: number): Promise<AiQuota> {
  const snap = await getFirestore().collection("aiUsage").doc(usageKeyFor(uid, plan, nowMs)).get();
  return quotaFrom(plan, snap.data()?.count ?? 0, nowMs);
}

export type SaveAiResult =
  | { status: "saved" | "reused"; listId: string }
  | { status: "limit-reached" }
  | { status: "not-found" };

const ICON_BY_LIST_TYPE: Record<ListType, string> = {
  shopping: "shopping-cart-simple",
  packing: "suitcase",
  task: "check",
};

/**
 * 編集後の結果を、通常のリストとして保存する(AI-004)。本人の成功済みの結果だけが対象で、
 * 保存直前のリスト上限(Free 3件)を同じtransaction内で判定する。同じrequestIdの再送は最初のlistIdを返す。
 * 項目の優先度は保存せず、理由をメモに入れる。
 */
export async function saveAiResultTransaction(
  uid: string,
  requestId: string,
  edited: { title: string; listType: ListType; items: AiResultItem[] },
  plan: Plan,
  displayName: string | null
): Promise<SaveAiResult> {
  const { db, requestRef } = refs(uid, requestId);
  const activeListRefsQuery = db.collection("users").doc(uid).collection("listRefs").where("archivedAt", "==", null);
  const items: NewItem[] = edited.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    note: item.reason,
    checked: false,
  }));
  let newListId: string | null = null;

  const result = await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) {
      return { status: "not-found" as const };
    }
    const data = requestSnap.data()!;
    if (data.status === "saved") {
      return { status: "reused" as const, listId: data.listId as string };
    }
    if (data.status !== "succeeded") {
      return { status: "not-found" as const };
    }
    const activeSnap = await tx.get(activeListRefsQuery);
    if (!isUnderActiveListLimit(activeSnap.size, plan)) {
      return { status: "limit-reached" as const };
    }

    const listRef = writeNewList(tx, db, uid, displayName, {
      name: edited.title,
      type: edited.listType,
      color: "primary",
      icon: ICON_BY_LIST_TYPE[edited.listType],
      totalCount: items.length,
      completedCount: 0,
    });
    tx.update(requestRef, { status: "saved", listId: listRef.id, updatedAt: FieldValue.serverTimestamp() });
    newListId = listRef.id;
    return { status: "saved" as const, listId: listRef.id };
  });

  if (result.status === "saved" && newListId) {
    await writeItemsInChunks(db, newListId, uid, items);
  }
  return result;
}

/** 結果の評価(役に立った/足りなかった)。結果が出ている自分のリクエストだけ。 */
export async function rateAiResultTransaction(uid: string, requestId: string, rating: AiRating): Promise<"ok" | "not-found"> {
  const { db, requestRef } = refs(uid, requestId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists || (snap.data()!.status !== "succeeded" && snap.data()!.status !== "saved")) {
      return "not-found" as const;
    }
    tx.update(requestRef, { rating, updatedAt: FieldValue.serverTimestamp() });
    return "ok" as const;
  });
}
