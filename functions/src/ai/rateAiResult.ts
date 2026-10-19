import { HttpsError, onCall } from "firebase-functions/v2/https";
import { rateAiResultRequestSchema, type RateAiResultResponse } from "@soroe/shared";

import { rateAiResultTransaction } from "./aiStore";

export async function rateAiResultHandler(input: unknown, uid: string): Promise<RateAiResultResponse> {
  const { requestId, rating } = rateAiResultRequestSchema.parse(input);
  if ((await rateAiResultTransaction(uid, requestId, rating)) === "not-found") {
    throw new HttpsError("not-found", "生成結果が見つかりません");
  }
  return { ok: true };
}

export const rateAiResult = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return rateAiResultHandler(request.data, request.auth.uid);
});
