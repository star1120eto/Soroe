import functions from '@react-native-firebase/functions';
import {
  createListResponseSchema,
  duplicateListResponseSchema,
  okResponseSchema,
  type ArchiveListRequest,
  type CreateListInput,
  type CreateListRequest,
  type CreateListResponse,
  type DeleteListRequest,
  type DuplicateListRequest,
  type DuplicateListResponse,
  type OkResponse,
  type RestoreListRequest,
  type UnarchiveListRequest,
} from '@soroe/shared';

// リスト作成・複製・アーカイブ・復元・削除のCallable Functions。ネイティブとWebで
// 共通(RN Firebaseのfunctionsはweb実装を持つ)のため、Firestoreを直接扱う
// ListRepository(.ts/.web.ts)とは別ファイルに分けている。

// ---- リスト作成 (Callable Functions、オンライン必須) ----
// Free上限の原子的判定をクライアント申告に委ねないため、createListだけは
// Functions側の実装(LIST-002)を経由する。

export async function createList(
  input: CreateListInput,
  requestId: string
): Promise<CreateListResponse> {
  const callable = functions().httpsCallable<CreateListRequest, CreateListResponse>('createList');
  const result = await callable({ ...input, requestId });
  return createListResponseSchema.parse(result.data);
}

// ---- LIST-006: 複製・アーカイブ・復元・削除 (Callable Functions) ----
// 所有権判定とFree上限の原子的判定をクライアントに持たせないため、
// createListと同様にすべてFunctions経由にする。

export async function archiveList(listId: string): Promise<OkResponse> {
  const callable = functions().httpsCallable<ArchiveListRequest, OkResponse>('archiveList');
  const result = await callable({ listId });
  return okResponseSchema.parse(result.data);
}

export async function deleteList(listId: string): Promise<OkResponse> {
  const callable = functions().httpsCallable<DeleteListRequest, OkResponse>('deleteList');
  const result = await callable({ listId });
  return okResponseSchema.parse(result.data);
}

export async function unarchiveList(listId: string, requestId: string): Promise<OkResponse> {
  const callable = functions().httpsCallable<UnarchiveListRequest, OkResponse>('unarchiveList');
  const result = await callable({ listId, requestId });
  return okResponseSchema.parse(result.data);
}

export async function restoreList(listId: string, requestId: string): Promise<OkResponse> {
  const callable = functions().httpsCallable<RestoreListRequest, OkResponse>('restoreList');
  const result = await callable({ listId, requestId });
  return okResponseSchema.parse(result.data);
}

export async function duplicateList(
  listId: string,
  requestId: string
): Promise<DuplicateListResponse> {
  const callable = functions().httpsCallable<DuplicateListRequest, DuplicateListResponse>('duplicateList');
  const result = await callable({ listId, requestId });
  return duplicateListResponseSchema.parse(result.data);
}
