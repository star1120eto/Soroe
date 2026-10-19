import { HttpsError, onCall } from "firebase-functions/v2/https";
import { saveMyTemplateRequestSchema, type SaveMyTemplateResponse } from "@soroe/shared";

import { getPlan } from "../lists/entitlements";
import { saveMyTemplateTransaction } from "./templateStore";

export async function saveMyTemplateHandler(input: unknown, uid: string): Promise<SaveMyTemplateResponse> {
  const { requestId, listId, title, description } = saveMyTemplateRequestSchema.parse(input);

  const plan = await getPlan(uid);
  const result = await saveMyTemplateTransaction(uid, requestId, listId, { title, description }, plan);

  if (result.status === "not-found") {
    throw new HttpsError("not-found", "リストが見つかりません");
  }
  if (result.status === "empty") {
    throw new HttpsError("invalid-argument", "項目がないリストはテンプレートにできません");
  }
  if (result.status === "limit-reached") {
    throw new HttpsError("resource-exhausted", "Freeプランで保存できるマイテンプレートは1件までです");
  }

  return { templateId: result.templateId };
}

export const saveMyTemplate = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return saveMyTemplateHandler(request.data, request.auth.uid);
});
