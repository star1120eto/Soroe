import { z } from "zod";

// soroe-functional-specification.md SHARE-01〜03 / family-checklist-product-design.md 12章。
// 招待・メンバー管理のCallable Functionsの入出力。
// expiresAtはFirestore Timestampをミリ秒epochへ正規化した値。

// 招待トークンはクライアントが生成する256bitの乱数(hex 64文字)。サーバーは
// SHA-256だけを保存し平文を持たない。同じトークンの再送が冪等性キーを兼ねる。
export const INVITE_TOKEN_BYTES = 32;
export const inviteTokenSchema = z.string().regex(/^[0-9a-f]{64}$/, "招待トークンの形式が正しくありません");

export const createInviteRequestSchema = z.object({
  listId: z.string().min(1),
  token: inviteTokenSchema,
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

export const createInviteResponseSchema = z.object({
  inviteId: z.string().min(1),
  expiresAt: z.number().int().positive(),
});
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;

export const revokeInviteRequestSchema = z.object({
  inviteId: z.string().min(1),
});
export type RevokeInviteRequest = z.infer<typeof revokeInviteRequestSchema>;

// 招待を使えない理由(プレビューと受諾で共通)。「想定内の不成立」は例外でなく
// statusで返し、UIが理由ごとに文言と次の導線を出し分けられるようにする。
export const inviteUnavailableStatusSchema = z.enum([
  "expired",
  "revoked",
  // 招待リンクは1回のみ有効。誰かが参加に使った時点で失効する。
  "used",
  "list-deleted",
  "list-archived",
  "not-found",
]);
export type InviteUnavailableStatus = z.infer<typeof inviteUnavailableStatusSchema>;

export const invitePreviewRequestSchema = z.object({
  token: inviteTokenSchema,
});
export type InvitePreviewRequest = z.infer<typeof invitePreviewRequestSchema>;

// 未認証でも見られるため、リスト名・招待者名・メンバー数だけを返す
// (項目内容は返さない)。
export const invitePreviewResponseSchema = z.union([
  z.object({
    status: z.literal("valid"),
    listName: z.string().min(1),
    inviterName: z.string().min(1).nullable(),
    memberCount: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  }),
  z.object({ status: inviteUnavailableStatusSchema }),
]);
export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;

export const acceptInviteRequestSchema = z.object({
  token: inviteTokenSchema,
  requestId: z.string().min(1),
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

export const acceptInviteResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("joined"), listId: z.string().min(1) }),
  z.object({ status: z.literal("already-member"), listId: z.string().min(1) }),
  z.object({ status: z.literal("limit-reached") }),
  z.object({ status: z.literal("own-invite") }),
  z.object({ status: z.literal("expired") }),
  z.object({ status: z.literal("revoked") }),
  z.object({ status: z.literal("used") }),
  z.object({ status: z.literal("list-deleted") }),
  z.object({ status: z.literal("list-archived") }),
  z.object({ status: z.literal("not-found") }),
]);
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>;

// SHARE-004: メンバー削除・退出・所有権移譲。
export const removeMemberRequestSchema = z.object({
  listId: z.string().min(1),
  memberUid: z.string().min(1),
});
export type RemoveMemberRequest = z.infer<typeof removeMemberRequestSchema>;

export const leaveListRequestSchema = z.object({
  listId: z.string().min(1),
});
export type LeaveListRequest = z.infer<typeof leaveListRequestSchema>;

export const transferOwnershipRequestSchema = z.object({
  listId: z.string().min(1),
  newOwnerUid: z.string().min(1),
});
export type TransferOwnershipRequest = z.infer<typeof transferOwnershipRequestSchema>;
