import { getFirestore } from "firebase-admin/firestore";
import { entitlementDocumentSchema, type RevenueCatEvent } from "@soroe/shared";

import { applyRevenueCatEvent, type ApplyResult } from "./applyEvent";

export type ProcessResult =
  | { status: "applied" }
  | { status: "duplicate" }
  | { status: "ignored"; reason: Extract<ApplyResult, { kind: "ignore" }>["reason"] };

// 外部eventIdの冪等キー(`webhookEvents/{eventId}`)と権利の更新を同じtransactionで書く。
// 同じイベントの再送・並行到着でも、反映は1回だけになる。
export async function processRevenueCatEvent(event: RevenueCatEvent, nowMs: number): Promise<ProcessResult> {
  const db = getFirestore();
  const eventRef = db.collection("webhookEvents").doc(`revenuecat_${event.id}`);

  return db.runTransaction(async (tx): Promise<ProcessResult> => {
    if ((await tx.get(eventRef)).exists) {
      return { status: "duplicate" };
    }
    const uid = event.app_user_id ?? "";
    const entRef = db.collection("entitlements").doc(uid || "_none");
    const prev = uid ? entitlementDocumentSchema.safeParse((await tx.get(entRef)).data()) : null;
    const result = applyRevenueCatEvent(prev?.success ? prev.data : null, event);

    // 本文(メール等)は保存しない。種別と時刻だけ残す。
    tx.set(eventRef, {
      type: event.type,
      uid: uid || null,
      outcome: result.kind === "update" ? "applied" : result.reason,
      receivedAt: nowMs,
    });
    if (result.kind === "ignore") {
      return { status: "ignored", reason: result.reason };
    }
    tx.set(entRef, result.doc);
    return { status: "applied" };
  });
}
