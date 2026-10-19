import { HttpsError, onCall } from "firebase-functions/v2/https";
import { revokeInviteRequestSchema, type OkResponse } from "@soroe/shared";

import { revokeInviteTransaction } from "./inviteStore";

export async function revokeInviteHandler(input: unknown, uid: string, nowMs: number): Promise<OkResponse> {
  const { inviteId } = revokeInviteRequestSchema.parse(input);

  const result = await revokeInviteTransaction(uid, inviteId, nowMs);
  if (result === "not-found") {
    throw new HttpsError("not-found", "招待が見つかりません");
  }
  if (result === "forbidden") {
    throw new HttpsError("permission-denied", "オーナーだけが招待を取り消せます");
  }

  return { ok: true };
}

export const revokeInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return revokeInviteHandler(request.data, request.auth.uid, Date.now());
});
