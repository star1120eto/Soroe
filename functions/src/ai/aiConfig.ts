import { getFirestore } from "firebase-admin/firestore";

import type { Plan } from "../lists/listLimit";

// docs/family-checklist-product-design.md 6.9: モデル名は設定値にし、アプリ更新なしで変えられる
// (Remote Config相当として、Firestoreの config/ai を使う)。既定値は設計書の初期案で、実際のAPI連携時に確定する。
export const DEFAULT_FREE_MODEL = "gpt-5.6-luna";
export const DEFAULT_PREMIUM_MODEL = "gpt-5.6-terra";

export async function getAiModel(plan: Plan): Promise<string> {
  const snap = await getFirestore().collection("config").doc("ai").get();
  const data = snap.data();
  const configured = plan === "premium" ? data?.premiumModel : data?.freeModel;
  if (typeof configured === "string" && configured.trim() !== "") {
    return configured;
  }
  return plan === "premium" ? DEFAULT_PREMIUM_MODEL : DEFAULT_FREE_MODEL;
}
