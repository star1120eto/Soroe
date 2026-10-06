import { HttpsError, onCall } from "firebase-functions/v2/https";
import { acceptInviteRequestSchema, type AcceptInviteResponse } from "@soroe/shared";

import { getPlan } from "../lists/entitlements";
import { getDisplayName } from "../users/profile";
import { enforceInviteRateLimit } from "./inviteRateLimit";
import { acceptInviteTransaction } from "./inviteStore";
import { hashInviteToken } from "./token";

export async function acceptInviteHandler(
  input: unknown,
  uid: string,
  nowMs: number
): Promise<AcceptInviteResponse> {
  await enforceInviteRateLimit("accept", uid, nowMs);
  const { token, requestId } = acceptInviteRequestSchema.parse(input);

  const [plan, displayName] = await Promise.all([getPlan(uid), getDisplayName(uid)]);
  return acceptInviteTransaction(uid, displayName, hashInviteToken(token), requestId, plan, nowMs);
}

export const acceptInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return acceptInviteHandler(request.data, request.auth.uid, Date.now());
});
