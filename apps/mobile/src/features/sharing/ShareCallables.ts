import functions from '@react-native-firebase/functions';
import {
  acceptInviteResponseSchema,
  createInviteResponseSchema,
  invitePreviewResponseSchema,
  okResponseSchema,
  type AcceptInviteRequest,
  type AcceptInviteResponse,
  type CreateInviteRequest,
  type CreateInviteResponse,
  type InvitePreviewRequest,
  type InvitePreviewResponse,
  type LeaveListRequest,
  type OkResponse,
  type RemoveMemberRequest,
  type RevokeInviteRequest,
  type TransferOwnershipRequest,
} from '@soroe/shared';

// 招待・メンバー管理のCallable Functions(オンライン必須)。ネイティブとWebで共通。
// メンバー構成・招待は検証(オーナー権限、期限、Free上限、最後のownerの保護)を伴うため、
// すべてCallable経由でclientから直接は書かない(firestore.rules)。

export async function createInvite(request: CreateInviteRequest): Promise<CreateInviteResponse> {
  const callable = functions().httpsCallable<CreateInviteRequest, CreateInviteResponse>('createInvite');
  const result = await callable(request);
  return createInviteResponseSchema.parse(result.data);
}

export async function revokeInvite(inviteId: string): Promise<OkResponse> {
  const callable = functions().httpsCallable<RevokeInviteRequest, OkResponse>('revokeInvite');
  const result = await callable({ inviteId });
  return okResponseSchema.parse(result.data);
}

/** 未認証でも呼べる(招待リンクを開いたがまだログインしていない状態のプレビュー)。 */
export async function previewInvite(token: string): Promise<InvitePreviewResponse> {
  const callable = functions().httpsCallable<InvitePreviewRequest, InvitePreviewResponse>('getInvitePreview');
  const result = await callable({ token });
  return invitePreviewResponseSchema.parse(result.data);
}

export async function acceptInvite(token: string, requestId: string): Promise<AcceptInviteResponse> {
  const callable = functions().httpsCallable<AcceptInviteRequest, AcceptInviteResponse>('acceptInvite');
  const result = await callable({ token, requestId });
  return acceptInviteResponseSchema.parse(result.data);
}

export async function removeMember(listId: string, memberUid: string): Promise<OkResponse> {
  const callable = functions().httpsCallable<RemoveMemberRequest, OkResponse>('removeMember');
  const result = await callable({ listId, memberUid });
  return okResponseSchema.parse(result.data);
}

export async function leaveList(listId: string): Promise<OkResponse> {
  const callable = functions().httpsCallable<LeaveListRequest, OkResponse>('leaveList');
  const result = await callable({ listId });
  return okResponseSchema.parse(result.data);
}

export async function transferOwnership(listId: string, newOwnerUid: string): Promise<OkResponse> {
  const callable = functions().httpsCallable<TransferOwnershipRequest, OkResponse>('transferOwnership');
  const result = await callable({ listId, newOwnerUid });
  return okResponseSchema.parse(result.data);
}
