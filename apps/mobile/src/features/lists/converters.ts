import firestore, { type FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import {
  listItemSchema,
  listMemberSchema,
  listSchema,
  userListRefSchema,
  userProfileSchema,
  type List,
  type ListItem,
  type ListMember,
  type UserListRef,
} from '@soroe/shared';

// Firestore型(Timestamp等)をドメイン型へ変換する境界。
// LIST-001「Firestore型をUIやドメインへ直接公開しない」に対応する。

type FirestoreData = FirebaseFirestoreTypes.DocumentData;

function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  // オフライン書込直後はserverTimestampがnullで返り、同期後にTimestampへ
  // 置き換わる。呼び出し側が待たずに扱えるよう、その間はnullのままにする。
  if (value instanceof firestore.Timestamp) {
    return value.toMillis();
  }
  if (typeof value === 'number') {
    return value;
  }
  return null;
}

function requireMillis(value: unknown, fallback: number): number {
  return toMillis(value) ?? fallback;
}

export function toList(id: string, data: FirestoreData): List {
  // serverTimestamp未確定の間はローカル時刻で埋め、同期後の値で上書きされる。
  const now = Date.now();
  return listSchema.parse({
    id,
    name: data.name,
    type: data.type,
    color: data.color,
    icon: data.icon,
    ownerId: data.ownerId,
    createdBy: data.createdBy,
    createdAt: requireMillis(data.createdAt, now),
    updatedAt: requireMillis(data.updatedAt, now),
    archivedAt: toMillis(data.archivedAt),
    deletedAt: toMillis(data.deletedAt),
  });
}

export function toListItem(id: string, listId: string, data: FirestoreData): ListItem {
  const now = Date.now();
  return listItemSchema.parse({
    id,
    listId,
    name: data.name,
    quantity: data.quantity ?? null,
    unit: data.unit ?? null,
    category: data.category ?? null,
    note: data.note ?? null,
    assigneeId: data.assigneeId ?? null,
    dueAt: toMillis(data.dueAt),
    completedAt: toMillis(data.completedAt),
    completedBy: data.completedBy ?? null,
    sortOrder: data.sortOrder,
    createdBy: data.createdBy,
    createdAt: requireMillis(data.createdAt, now),
    updatedAt: requireMillis(data.updatedAt, now),
    deletedAt: toMillis(data.deletedAt),
  });
}

function parseMemberDisplayName(value: unknown): string | null {
  const parsed = userProfileSchema.shape.displayName.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toListMember(uid: string, listId: string, data: FirestoreData): ListMember {
  const now = Date.now();
  return listMemberSchema.parse({
    uid,
    listId,
    role: data.role,
    joinedAt: requireMillis(data.joinedAt, now),
    // 表示名は参加時にサーバーが検証して非正規化するが、不正な値が1件あるだけで
    // メンバー一覧の購読全体が例外になるのを避けるため、プロフィールの規則
    // (trim、1〜30文字)を満たさなければnull(UIが「メンバー」へフォールバックする)。
    displayName: parseMemberDisplayName(data.displayName),
  });
}

export function toUserListRef(listId: string, data: FirestoreData): UserListRef {
  const now = Date.now();
  return userListRefSchema.parse({
    listId,
    name: data.name,
    type: data.type,
    color: data.color,
    icon: data.icon,
    role: data.role,
    totalCount: data.totalCount ?? 0,
    completedCount: data.completedCount ?? 0,
    memberCount: data.memberCount ?? 1,
    updatedAt: requireMillis(data.updatedAt, now),
    archivedAt: toMillis(data.archivedAt),
    deletedAt: toMillis(data.deletedAt),
  });
}

/**
 * 一覧用参照の一括変換。name等を持たない不完全なドキュメント(集計だけが書き込まれた
 * 等)が1件あっても、その1件だけを読み飛ばし、残りのリストを表示できるようにする。
 */
export function toUserListRefs(docs: { id: string; data: () => FirestoreData }[]): UserListRef[] {
  const refs: UserListRef[] = [];
  for (const doc of docs) {
    try {
      refs.push(toUserListRef(doc.id, doc.data()));
    } catch (error) {
      console.warn(`skipping malformed listRef ${doc.id}`, error);
    }
  }
  return refs;
}
