import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { AiQuota } from "@soroe/shared";

import { getPlan } from "../lists/entitlements";
import { getAiQuota } from "./aiStore";

/** 残り回数(Premiumは次回リセット日時つき)。回数の正はサーバーだけが持つ。 */
export async function getAiQuotaHandler(uid: string, nowMs: number = Date.now()): Promise<AiQuota> {
  return getAiQuota(uid, await getPlan(uid), nowMs);
}

export const getAiQuotaCallable = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return getAiQuotaHandler(request.auth.uid);
});
