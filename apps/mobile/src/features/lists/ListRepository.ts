import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import type {
  CreateListInput,
  CreateListItemInput,
  List,
  ListItem,
  UpdateListInput,
  UpdateListItemInput,
  UserListRef,
} from '@soroe/shared';

import { toList, toListItem, toUserListRef } from './converters';

// Firestoreへの唯一の窓口。soroe-technology-stack-evaluation.md 5章に従い、
// オフラインで完結してよい項目CRUDだけをclient writeにし、上限・権利・所有権が
// 絡む操作(リスト作成/複製/アーカイブ解除など)はCallable Functionsへ寄せる。
// Firestoreのtransactionはオフラインで失敗するため、その差が重要。

const LISTS = 'lists';
const ITEMS = 'items';
const USERS = 'users';
const LIST_REFS = 'listRefs';

function listsCollection() {
  return firestore().collection(LISTS);
}

function itemsCollection(listId: string) {
  return listsCollection().doc(listId).collection(ITEMS);
}

function listRefsCollection(uid: string) {
  return firestore().collection(USERS).doc(uid).collection(LIST_REFS);
}

/** 一覧画面用。全リストの全項目ではなく一覧用documentだけを購読する。 */
export function subscribeToUserLists(
  uid: string,
  onChange: (lists: UserListRef[]) => void,
  onError: (error: Error) => void
): () => void {
  return listRefsCollection(uid)
    .where('archivedAt', '==', null)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(
      (snapshot) => onChange(snapshot.docs.map((doc) => toUserListRef(doc.id, doc.data()))),
      onError
    );
}

export function subscribeToList(
  listId: string,
  onChange: (list: List | null) => void,
  onError: (error: Error) => void
): () => void {
  return listsCollection()
    .doc(listId)
    .onSnapshot((snapshot) => {
      const data = snapshot.data();
      onChange(data ? toList(snapshot.id, data) : null);
    }, onError);
}

/** 未同期の書込が残っているか。OFF-001のオフラインBanner判定に使う。 */
export type ListItemsSnapshot = {
  items: ListItem[];
  hasPendingWrites: boolean;
  isFromCache: boolean;
};

/** 詳細画面用。画面を離れたら必ず解除して読取課金を抑える。 */
export function subscribeToListItems(
  listId: string,
  onChange: (snapshot: ListItemsSnapshot) => void,
  onError: (error: Error) => void
): () => void {
  return itemsCollection(listId)
    .where('deletedAt', '==', null)
    .orderBy('sortOrder', 'asc')
    // includeMetadataChangesが無いと、書込がサーバーへ到達した瞬間の
    // hasPendingWrites=falseへの変化を受け取れない。
    .onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
      onChange({
        items: snapshot.docs.map((doc) => toListItem(doc.id, listId, doc.data())),
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        isFromCache: snapshot.metadata.fromCache,
      });
    }, onError);
}

// ---- 項目CRUD (Rules付きclient write、オフライン可) ----

export async function addListItem(
  listId: string,
  uid: string,
  input: CreateListItemInput,
  sortOrder: number
): Promise<string> {
  const doc = itemsCollection(listId).doc();
  // awaitはサーバー到達を待つ: オフラインでは解決しないため、呼び出し側は
  // 完了を待たずに楽観的更新へ進める(Firestoreのローカルキャッシュが即反映する)。
  doc.set({
    name: input.name,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    category: input.category ?? null,
    note: input.note ?? null,
    assigneeId: input.assigneeId ?? null,
    dueAt: input.dueAt ? firestore.Timestamp.fromMillis(input.dueAt) : null,
    completedAt: null,
    completedBy: null,
    sortOrder,
    createdBy: uid,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  return doc.id;
}

export function updateListItem(listId: string, itemId: string, input: UpdateListItemInput): void {
  const patch: Record<string, unknown> = { updatedAt: firestore.FieldValue.serverTimestamp() };
  // 変更フィールドだけ更新する(LIST-03)。undefinedは「未指定」として無視し、
  // nullは「値を消す」として送る。
  if (input.name !== undefined) patch.name = input.name;
  if (input.quantity !== undefined) patch.quantity = input.quantity;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.category !== undefined) patch.category = input.category;
  if (input.note !== undefined) patch.note = input.note;
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
  if (input.dueAt !== undefined) {
    patch.dueAt = input.dueAt ? firestore.Timestamp.fromMillis(input.dueAt) : null;
  }

  itemsCollection(listId).doc(itemId).update(patch);
}

export function setListItemCompletion(
  listId: string,
  itemId: string,
  uid: string,
  completed: boolean
): void {
  itemsCollection(listId)
    .doc(itemId)
    .update({
      completedAt: completed ? firestore.FieldValue.serverTimestamp() : null,
      completedBy: completed ? uid : null,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
}

export function reorderListItem(listId: string, itemId: string, sortOrder: number): void {
  itemsCollection(listId)
    .doc(itemId)
    .update({ sortOrder, updatedAt: firestore.FieldValue.serverTimestamp() });
}

/** 論理削除。30日後の物理削除はサーバー側ジョブが行う(LIST-006)。 */
export function softDeleteListItem(listId: string, itemId: string): void {
  itemsCollection(listId)
    .doc(itemId)
    .update({
      deletedAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
}

// ---- 権利変更 (Callable Functions、オンライン必須) ----
// Free上限やEntitlementの原子的判定をクライアント申告に委ねないため、
// これらはFunctions側の実装(LIST-002/LIST-006)を待つ。

export async function createList(input: CreateListInput, requestId: string): Promise<{ listId: string }> {
  const callable = functions().httpsCallable<
    CreateListInput & { requestId: string },
    { listId: string }
  >('createList');
  const result = await callable({ ...input, requestId });
  return result.data;
}

export async function updateList(listId: string, input: UpdateListInput): Promise<void> {
  await functions().httpsCallable<{ listId: string } & UpdateListInput, void>('updateList')({
    listId,
    ...input,
  });
}
