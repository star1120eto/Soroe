import { HttpsError, onCall } from "firebase-functions/v2/https";
import { leaveListRequestSchema, type OkResponse } from "@soroe/shared";

import { leaveListTransaction } from "./memberManagement";

export async function leaveListHandler(input: unknown, uid: string): Promise<OkResponse> {
  const { listId } = leaveListRequestSchema.parse(input);

  const result = await leaveListTransaction(uid, listId);
  if (result === "owner-cannot-leave") {
    throw new HttpsError(
      "failed-precondition",
      "オーナーは退出できません。先に所有権を移譲するかリストを削除してください"
    );
  }

  return { ok: true };
}

export const leaveList = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return leaveListHandler(request.data, request.auth.uid);
});
