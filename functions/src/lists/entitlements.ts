import { getFirestore } from "firebase-admin/firestore";
import { entitlementDocumentSchema, isPremiumPlan, resolveEffectivePlan } from "@soroe/shared";

import type { Plan } from "./listLimit";

// entitlements/{uid}はRevenueCat Webhook(PAY-004)だけが書く。存在しない・不正な内容は常にFree。
// 猶予中(grace)はPremium機能を維持するためpremiumとして返す。期限は読取時刻で判定する。
export async function getPlan(uid: string, nowMs: number = Date.now()): Promise<Plan> {
  const snap = await getFirestore().collection("entitlements").doc(uid).get();
  const parsed = entitlementDocumentSchema.safeParse(snap.data());
  return isPremiumPlan(resolveEffectivePlan(parsed.success ? parsed.data : null, nowMs)) ? "premium" : "free";
}
