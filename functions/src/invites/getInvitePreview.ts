import { onCall } from "firebase-functions/v2/https";
import { invitePreviewRequestSchema, type InvitePreviewResponse } from "@soroe/shared";

import { enforceInviteRateLimit } from "./inviteRateLimit";
import { getInvitePreview as loadInvitePreview } from "./inviteStore";
import { hashInviteToken } from "./token";

export async function getInvitePreviewHandler(
  input: unknown,
  ip: string,
  nowMs: number
): Promise<InvitePreviewResponse> {
  await enforceInviteRateLimit("preview", ip, nowMs);
  const { token } = invitePreviewRequestSchema.parse(input);
  return loadInvitePreview(hashInviteToken(token), nowMs);
}

// 招待リンクを受け取った未認証ユーザーにも見せるプレビューのため、認証を要求しない
// (仕様SHARE-02「未認証時: リスト名、招待者名、メンバー数をプレビューする」)。
// その代わりIP単位でレート制限する。
export const getInvitePreview = onCall(async (request) => {
  return getInvitePreviewHandler(request.data, request.rawRequest.ip ?? "unknown", Date.now());
});
