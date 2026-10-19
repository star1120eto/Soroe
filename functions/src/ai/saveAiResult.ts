import { HttpsError, onCall } from "firebase-functions/v2/https";
import { saveAiResultRequestSchema, type SaveAiResultResponse } from "@soroe/shared";

import { getPlan } from "../lists/entitlements";
import { getDisplayName } from "../users/profile";
import { saveAiResultTransaction } from "./aiStore";

export async function saveAiResultHandler(input: unknown, uid: string): Promise<SaveAiResultResponse> {
  const { requestId, ...edited } = saveAiResultRequestSchema.parse(input);

  const [plan, displayName] = await Promise.all([getPlan(uid), getDisplayName(uid)]);
  const result = await saveAiResultTransaction(uid, requestId, edited, plan, displayName);

  if (result.status === "saved" || result.status === "reused") {
    return { status: "saved", listId: result.listId };
  }
  return { status: result.status };
}

export const saveAiResult = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return saveAiResultHandler(request.data, request.auth.uid);
});
