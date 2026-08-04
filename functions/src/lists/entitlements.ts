import { getFirestore } from "firebase-admin/firestore";

import type { Plan } from "./listLimit";

// PAY-004(RevenueCat Webhook)がentitlements/{uid}を同期するまでは
// ドキュメントが存在しない。存在しない・planがpremium以外は常にFreeとして扱う。
export async function getPlan(uid: string): Promise<Plan> {
  const snap = await getFirestore().collection("entitlements").doc(uid).get();
  return snap.data()?.plan === "premium" ? "premium" : "free";
}
