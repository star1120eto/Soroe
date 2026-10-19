import { FieldValue, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import type { ListType } from "@soroe/shared";

import { FIRESTORE_BATCH_CHUNK_SIZE } from "./constants";

// テンプレート・AI生成の結果からリストを作る処理の共通部分(createList/duplicateListと同じ形)。
// リスト本体・ownerメンバー・一覧用参照はtransactionで書き、項目は500書込の上限を避けるため
// transactionの外で400件ずつのbatchに分ける。

export type NewItem = {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  note: string | null;
  /** 完了済みで作るか(マイテンプレートの初期チェック状態)。 */
  checked: boolean;
};

export type NewListFields = {
  name: string;
  type: ListType;
  color: string;
  icon: string;
  totalCount: number;
  completedCount: number;
};

/** リスト・ownerメンバー・一覧用参照をtransactionへ書き、リストの参照を返す。 */
export function writeNewList(
  tx: Transaction,
  db: Firestore,
  uid: string,
  displayName: string | null,
  fields: NewListFields
): DocumentReference {
  const listRef = db.collection("lists").doc();
  const now = FieldValue.serverTimestamp();
  tx.set(listRef, {
    name: fields.name,
    type: fields.type,
    color: fields.color,
    icon: fields.icon,
    ownerId: uid,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    deletedAt: null,
  });
  tx.set(listRef.collection("members").doc(uid), { role: "owner", joinedAt: now, displayName });
  tx.set(db.collection("users").doc(uid).collection("listRefs").doc(listRef.id), {
    name: fields.name,
    type: fields.type,
    color: fields.color,
    icon: fields.icon,
    role: "owner",
    totalCount: fields.totalCount,
    completedCount: fields.completedCount,
    memberCount: 1,
    updatedAt: now,
    archivedAt: null,
    deletedAt: null,
  });
  return listRef;
}

export async function writeItemsInChunks(db: Firestore, listId: string, uid: string, items: NewItem[]): Promise<void> {
  const itemsCollection = db.collection("lists").doc(listId).collection("items");
  const now = FieldValue.serverTimestamp();

  for (let offset = 0; offset < items.length; offset += FIRESTORE_BATCH_CHUNK_SIZE) {
    const batch = db.batch();
    items.slice(offset, offset + FIRESTORE_BATCH_CHUNK_SIZE).forEach((item, index) => {
      batch.set(itemsCollection.doc(), {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        note: item.note,
        assigneeId: null,
        dueAt: null,
        completedAt: item.checked ? now : null,
        completedBy: item.checked ? uid : null,
        sortOrder: (offset + index + 1) * 1000,
        createdBy: uid,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    });
    await batch.commit();
  }
}
