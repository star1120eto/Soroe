import { HttpsError, onCall } from "firebase-functions/v2/https";
import { archiveListRequestSchema, type OkResponse } from "@soroe/shared";

import { archiveListTransaction } from "./listStore";

export async function archiveListHandler(input: unknown, uid: string): Promise<OkResponse> {
  const { listId } = archiveListRequestSchema.parse(input);

  const result = await archiveListTransaction(uid, listId);
  if (result === "not-found") {
    throw new HttpsError("not-found", "リストが見つかりません");
  }
  if (result === "forbidden") {
    throw new HttpsError("permission-denied", "オーナーだけがアーカイブできます");
  }

  return { ok: true };
}

export const archiveList = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return archiveListHandler(request.data, request.auth.uid);
});
