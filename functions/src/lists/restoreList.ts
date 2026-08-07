import { HttpsError, onCall } from "firebase-functions/v2/https";
import { restoreListRequestSchema, type OkResponse } from "@soroe/shared";

import { getPlan } from "./entitlements";
import { restoreListTransaction } from "./listStore";

export async function restoreListHandler(input: unknown, uid: string): Promise<OkResponse> {
  const { requestId, listId } = restoreListRequestSchema.parse(input);

  const plan = await getPlan(uid);
  const result = await restoreListTransaction(uid, requestId, listId, plan);

  if (result.status === "not-found") {
    throw new HttpsError("not-found", "リストが見つかりません");
  }
  if (result.status === "forbidden") {
    throw new HttpsError("permission-denied", "オーナーだけが復元できます");
  }
  if (result.status === "expired") {
    throw new HttpsError("failed-precondition", "削除から30日を過ぎたリストは復元できません");
  }
  if (result.status === "limit-reached") {
    throw new HttpsError("resource-exhausted", "Freeプランで利用できるリストは3件までです");
  }

  return { ok: true };
}

export const restoreList = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return restoreListHandler(request.data, request.auth.uid);
});
