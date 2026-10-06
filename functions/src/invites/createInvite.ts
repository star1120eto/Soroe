import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createInviteRequestSchema, type CreateInviteResponse } from "@soroe/shared";

import { enforceInviteRateLimit } from "./inviteRateLimit";
import { createInviteTransaction } from "./inviteStore";
import { hashInviteToken } from "./token";

export async function createInviteHandler(
  input: unknown,
  uid: string,
  nowMs: number
): Promise<CreateInviteResponse> {
  await enforceInviteRateLimit("create", uid, nowMs);
  const { listId, token } = createInviteRequestSchema.parse(input);

  const result = await createInviteTransaction(uid, listId, hashInviteToken(token), nowMs);

  switch (result.status) {
    case "created":
    case "reused":
      return { inviteId: result.inviteId, expiresAt: result.expiresAtMs };
    case "not-found":
      throw new HttpsError("not-found", "リストが見つかりません");
    case "forbidden":
      throw new HttpsError("permission-denied", "オーナーだけが招待を作成できます");
    case "list-unavailable":
      throw new HttpsError("failed-precondition", "アーカイブ中・削除済みのリストには招待できません");
    case "token-conflict":
      throw new HttpsError("already-exists", "招待リンクを作成できませんでした。もう一度お試しください");
  }
}

export const createInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return createInviteHandler(request.data, request.auth.uid, Date.now());
});
