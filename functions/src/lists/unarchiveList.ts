import { HttpsError, onCall } from "firebase-functions/v2/https";
import { unarchiveListRequestSchema, type OkResponse } from "@soroe/shared";

import { getPlan } from "./entitlements";
import { unarchiveListTransaction } from "./listStore";

export async function unarchiveListHandler(input: unknown, uid: string): Promise<OkResponse> {
  const { requestId, listId } = unarchiveListRequestSchema.parse(input);

  const plan = await getPlan(uid);
  const result = await unarchiveListTransaction(uid, requestId, listId, plan);

  if (result.status === "not-found") {
    throw new HttpsError("not-found", "リストが見つかりません");
  }
  if (result.status === "forbidden") {
    throw new HttpsError("permission-denied", "オーナーだけがアーカイブを解除できます");
  }
  if (result.status === "limit-reached") {
    throw new HttpsError("resource-exhausted", "Freeプランで利用できるリストは3件までです");
  }

  return { ok: true };
}

export const unarchiveList = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return unarchiveListHandler(request.data, request.auth.uid);
});
