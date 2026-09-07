import type { DocumentData, Firestore, Timestamp } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

type SyncedFields = {
  name: unknown;
  type: unknown;
  color: unknown;
  icon: unknown;
  archivedAt: unknown;
  deletedAt: unknown;
  updatedAt: unknown;
};

function pickSyncedFields(data: DocumentData): SyncedFields {
  return {
    name: data.name,
    type: data.type,
    color: data.color,
    icon: data.icon,
    archivedAt: data.archivedAt,
    deletedAt: data.deletedAt,
    updatedAt: data.updatedAt,
  };
}

function timestampsEqual(a: unknown, b: unknown): boolean {
  if (a === null && b === null) {
    return true;
  }
  if (a instanceof Object && b instanceof Object && "isEqual" in a) {
    return (a as Timestamp).isEqual(b as Timestamp);
  }
  return a === b;
}

function hasSyncedFieldChange(before: SyncedFields, after: SyncedFields): boolean {
  return (
    before.name !== after.name ||
    before.type !== after.type ||
    before.color !== after.color ||
    before.icon !== after.icon ||
    !timestampsEqual(before.archivedAt, after.archivedAt) ||
    !timestampsEqual(before.deletedAt, after.deletedAt)
  );
}

// users/{uid}/listRefsは一覧画面用の非正規化コピー。lists/{listId}の表示用
// フィールドが変わったら全メンバーへ伝播する(Rulesがlistの直接書込をowner限定にし、
// listRefsへの直接書込自体をclientから拒否しているため)。
export async function syncListRefHandler(
  db: Pick<Firestore, "collection" | "batch">,
  listId: string,
  before: DocumentData,
  after: DocumentData
): Promise<void> {
  const beforeFields = pickSyncedFields(before);
  const afterFields = pickSyncedFields(after);
  if (!hasSyncedFieldChange(beforeFields, afterFields)) {
    return;
  }

  const membersSnap = await db.collection("lists").doc(listId).collection("members").get();
  if (membersSnap.empty) {
    return;
  }

  const batch = db.batch();
  for (const memberDoc of membersSnap.docs) {
    batch.update(
      db.collection("users").doc(memberDoc.id).collection("listRefs").doc(listId),
      afterFields
    );
  }
  await batch.commit();
}

export const syncListRef = onDocumentUpdated("lists/{listId}", async (event) => {
  if (!event.data) {
    return;
  }
  await syncListRefHandler(
    getFirestore(),
    event.params.listId,
    event.data.before.data(),
    event.data.after.data()
  );
});
