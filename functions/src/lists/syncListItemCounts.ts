import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

// 集計クエリ(count()の != フィルタ)は複合インデックスを新規に要求するため、
// 通常のgetで全件取得しJS側で数える。家族向けリストの規模では十分軽量。
export function computeItemCounts(
  items: { completedAt: unknown }[]
): { totalCount: number; completedCount: number } {
  return {
    totalCount: items.length,
    // != null はnullとundefinedの両方を「未完了」として扱うための保険
    // (今のところcompletedAtが欠けたitemは無いが、将来の書き込み漏れに
    // 対して安全側に倒す)。
    completedCount: items.filter((item) => item.completedAt != null).length,
  };
}

export async function syncListItemCountsHandler(
  db: Pick<Firestore, "collection" | "batch">,
  listId: string
): Promise<void> {
  const listRef = db.collection("lists").doc(listId);
  const itemsSnap = await listRef.collection("items").where("deletedAt", "==", null).get();
  const counts = computeItemCounts(
    itemsSnap.docs.map((doc: { data: () => DocumentData }) => doc.data() as { completedAt: unknown })
  );

  const membersSnap = await listRef.collection("members").get();
  if (membersSnap.empty) {
    return;
  }

  const batch = db.batch();
  for (const memberDoc of membersSnap.docs) {
    // updateではなくmerge:trueのsetにしているのは、対象のlistRefが万一
    // 存在しない場合でもbatch全体を失敗させないため。
    batch.set(
      db.collection("users").doc(memberDoc.id).collection("listRefs").doc(listId),
      counts,
      { merge: true }
    );
  }
  await batch.commit();
}

// items/{itemId}への追加・更新(完了トグル・論理削除含む)すべてで発火する。
// 物理削除は既存Rulesで禁止されているためonDocumentWrittenのdelete分岐は
// 実質発生しない。retry:trueはcommit失敗時にFirestoreへ再試行させるため
// 指定する(このhandlerは全件再計算のため完全に冪等で、再試行しても安全)。
export const syncListItemCounts = onDocumentWritten(
  { document: "lists/{listId}/items/{itemId}", retry: true },
  async (event) => {
    await syncListItemCountsHandler(getFirestore(), event.params.listId);
  }
);
