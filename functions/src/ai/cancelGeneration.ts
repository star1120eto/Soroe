import { HttpsError, onCall } from "firebase-functions/v2/https";
import { cancelGenerationRequestSchema, type CancelGenerationResponse } from "@soroe/shared";

import { cancelGenerationTransaction } from "./aiStore";

export async function cancelGenerationHandler(input: unknown, uid: string): Promise<CancelGenerationResponse> {
  const { requestId } = cancelGenerationRequestSchema.parse(input);
  return { status: await cancelGenerationTransaction(uid, requestId) };
}

export const cancelGeneration = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return cancelGenerationHandler(request.data, request.auth.uid);
});
