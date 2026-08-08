import { HttpsError, onCall } from "firebase-functions/v2/https";
import { deleteListRequestSchema, type OkResponse } from "@soroe/shared";

import { deleteListTransaction } from "./listStore";

export async function deleteListHandler(input: unknown, uid: string): Promise<OkResponse> {
  const { listId } = deleteListRequestSchema.parse(input);

  const result = await deleteListTransaction(uid, listId);
  if (result === "not-found") {
    throw new HttpsError("not-found", "リストが見つかりません");
  }
  if (result === "forbidden") {
    throw new HttpsError("permission-denied", "オーナーだけが削除できます");
  }

  return { ok: true };
}

export const deleteList = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return deleteListHandler(request.data, request.auth.uid);
});
