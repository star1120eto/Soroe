import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createListRequestSchema, type CreateListResponse } from "@soroe/shared";

import { getPlan } from "./entitlements";
import { createListTransaction } from "./listStore";

export async function createListHandler(
  input: unknown,
  uid: string
): Promise<CreateListResponse> {
  const { requestId, ...fields } = createListRequestSchema.parse(input);

  const plan = await getPlan(uid);
  const result = await createListTransaction(uid, requestId, fields, plan);

  if (result.status === "limit-reached") {
    throw new HttpsError("resource-exhausted", "Freeプランで作成できるリストは3件までです");
  }

  return { listId: result.listId };
}

export const createList = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return createListHandler(request.data, request.auth.uid);
});
