import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { webFirestore } from '@/lib/firebase/webFirestore';

import { toList, toListItem, toListMember, toUserListRefs } from './converters';
import type * as Native from './ListRepository';

// ListRepository.ts のWeb版。RN Firebaseのweb実装はlite SDKでリアルタイム購読を
// 使えないため、Firestoreを直接扱う部分(購読・項目CRUD・リスト編集)を完全版の
// firebase JS SDKで実装する。Callable(作成・複製・アーカイブ等)は共通の ListCallables.ts。
// 各関数は `typeof Native.xxx` で型を付け、ネイティブ版とシグネチャが食い違えば
// typecheckで落ちるようにしている。

const db = webFirestore;

const listsCollection = () => collection(db(), 'lists');
const itemsCollection = (listId: string) => collection(db(), 'lists', listId, 'items');
const listRefsCollection = (uid: string) => collection(db(), 'users', uid, 'listRefs');
const membersCollection = (listId: string) => collection(db(), 'lists', listId, 'members');

export const subscribeToUserLists: typeof Native.subscribeToUserLists = (uid, onChange, onError) =>
  onSnapshot(
    query(listRefsCollection(uid), where('archivedAt', '==', null), orderBy('updatedAt', 'desc')),
    (snapshot) => onChange(toUserListRefs(snapshot.docs)),
    onError
  );

export const subscribeToList: typeof Native.subscribeToList = (listId, onChange, onError) =>
  onSnapshot(
    doc(listsCollection(), listId),
    (snapshot) => {
      const data = snapshot.data();
      onChange(data ? toList(snapshot.id, data) : null);
    },
    onError
  );

export const subscribeToArchivedOrDeletedLists: typeof Native.subscribeToArchivedOrDeletedLists = (
  uid,
  onChange,
  onError
) =>
  onSnapshot(
    query(listRefsCollection(uid), where('archivedAt', '!=', null)),
    (snapshot) => onChange(toUserListRefs(snapshot.docs)),
    onError
  );

export const subscribeToListMembers: typeof Native.subscribeToListMembers = (listId, onChange, onError) =>
  onSnapshot(
    membersCollection(listId),
    (snapshot) => onChange(snapshot.docs.map((d) => toListMember(d.id, listId, d.data()))),
    onError
  );

export const subscribeToListItem: typeof Native.subscribeToListItem = (listId, itemId, onChange, onError) =>
  onSnapshot(
    doc(itemsCollection(listId), itemId),
    (snapshot) => {
      const data = snapshot.data();
      // 論理削除された項目は「存在しない」扱いにする(ネイティブ版と同じ)。
      onChange(data && data.deletedAt === null ? toListItem(snapshot.id, listId, data) : null);
    },
    onError
  );

export type ListItemsSnapshot = Native.ListItemsSnapshot;

export const subscribeToListItems: typeof Native.subscribeToListItems = (listId, onChange, onError) =>
  onSnapshot(
    query(itemsCollection(listId), where('deletedAt', '==', null), orderBy('sortOrder', 'asc')),
    // includeMetadataChangesが無いと、書込がサーバーへ到達した瞬間のhasPendingWrites=false
    // への変化を受け取れない。
    { includeMetadataChanges: true },
    (snapshot) =>
      onChange({
        items: snapshot.docs.map((d) => toListItem(d.id, listId, d.data())),
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        isFromCache: snapshot.metadata.fromCache,
      }),
    onError
  );

// ---- 項目CRUD / リスト編集 (Rules付きclient write) ----

export const addListItem: typeof Native.addListItem = async (listId, uid, input, sortOrder) => {
  const ref = doc(itemsCollection(listId));
  // ネイティブ版と同様、サーバー到達を待たない(オフラインでは解決しないため)。
  void setDoc(ref, {
    name: input.name,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    category: input.category ?? null,
    note: input.note ?? null,
    assigneeId: input.assigneeId ?? null,
    dueAt: input.dueAt ? Timestamp.fromMillis(input.dueAt) : null,
    completedAt: null,
    completedBy: null,
    sortOrder,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deletedAt: null,
  }).catch((error) => console.error('addListItem failed', error));
  return ref.id;
};

export const updateListItem: typeof Native.updateListItem = (listId, itemId, input) => {
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.quantity !== undefined) patch.quantity = input.quantity;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.category !== undefined) patch.category = input.category;
  if (input.note !== undefined) patch.note = input.note;
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
  if (input.dueAt !== undefined) {
    patch.dueAt = input.dueAt ? Timestamp.fromMillis(input.dueAt) : null;
  }
  void updateDoc(doc(itemsCollection(listId), itemId), patch).catch((error) =>
    console.error('updateListItem failed', error)
  );
};

export const setListItemCompletion: typeof Native.setListItemCompletion = (listId, itemId, uid, completed) => {
  void updateDoc(doc(itemsCollection(listId), itemId), {
    completedAt: completed ? serverTimestamp() : null,
    completedBy: completed ? uid : null,
    updatedAt: serverTimestamp(),
  }).catch((error) => console.error('setListItemCompletion failed', error));
};

export const reorderListItem: typeof Native.reorderListItem = (listId, itemId, sortOrder) => {
  void updateDoc(doc(itemsCollection(listId), itemId), { sortOrder, updatedAt: serverTimestamp() }).catch((error) =>
    console.error('reorderListItem failed', error)
  );
};

export const softDeleteListItem: typeof Native.softDeleteListItem = (listId, itemId) => {
  void updateDoc(doc(itemsCollection(listId), itemId), {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch((error) => console.error('softDeleteListItem failed', error));
};

export type EditableListFields = Native.EditableListFields;

export const updateList: typeof Native.updateList = (listId, input) => {
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (input.icon !== undefined) patch.icon = input.icon;
  void updateDoc(doc(listsCollection(), listId), patch).catch((error) => console.error('updateList failed', error));
};

export * from './ListCallables';
