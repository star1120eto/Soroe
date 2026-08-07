import { HttpsError, onCall } from "firebase-functions/v2/https";
import { duplicateListRequestSchema, type DuplicateListResponse } from "@soroe/shared";

import { getPlan } from "./entitlements";
import { duplicateListTransaction } from "./listStore";

export async function duplicateListHandler(input: unknown, uid: string): Promise<DuplicateListResponse> {
  const { requestId, listId } = duplicateListRequestSchema.parse(input);

  const plan = await getPlan(uid);
  const result = await duplicateListTransaction(uid, requestId, listId, plan);

  if (result.status === "not-found") {
    throw new HttpsError("not-found", "リストが見つかりません");
  }
  if (result.status === "limit-reached") {
    throw new HttpsError("resource-exhausted", "Freeプランで作成できるリストは3件までです");
  }

  return { listId: result.listId };
}

export const duplicateList = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return duplicateListHandler(request.data, request.auth.uid);
});
