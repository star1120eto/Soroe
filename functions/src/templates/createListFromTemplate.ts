import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createListFromTemplateRequestSchema, type CreateListFromTemplateResponse } from "@soroe/shared";

import { getPlan } from "../lists/entitlements";
import { getDisplayName } from "../users/profile";
import { createListFromTemplateTransaction } from "./templateStore";

export async function createListFromTemplateHandler(input: unknown, uid: string): Promise<CreateListFromTemplateResponse> {
  const { requestId, ...fields } = createListFromTemplateRequestSchema.parse(input);

  const [plan, displayName] = await Promise.all([getPlan(uid), getDisplayName(uid)]);
  const result = await createListFromTemplateTransaction(uid, requestId, fields, plan, displayName);

  if (result.status === "not-found") {
    throw new HttpsError("not-found", "テンプレートが見つかりません");
  }
  if (result.status === "invalid-items") {
    throw new HttpsError("invalid-argument", "選択した項目がテンプレートにありません");
  }
  if (result.status === "limit-reached") {
    throw new HttpsError("resource-exhausted", "Freeプランで作成できるリストは3件までです");
  }

  return { listId: result.listId };
}

export const createListFromTemplate = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return createListFromTemplateHandler(request.data, request.auth.uid);
});
