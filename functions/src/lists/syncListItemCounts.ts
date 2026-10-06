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

// 集計はtransactionで行う。transaction外で「読む→書く」を行うと、並行する別の
// invocationが古い読み取り結果を後から書き込み、最新の値を上書きしうる
// (transactionなら競合を検知して読み直すため、最後に書かれた値は常に最新の状態と一致する)。
// また、メンバーのlistRefが既に無い場合は書かない: メンバー削除や物理削除と競合した際に、
// 削除済みのlistRefをname等を持たない不完全なドキュメントとして復活させ、クライアントの
// 一覧変換(toUserListRef)を壊さないため。
export async function syncListItemCountsHandler(
  db: Pick<Firestore, "collection" | "runTransaction">,
  listId: string
): Promise<void> {
  const listRef = db.collection("lists").doc(listId);

  await db.runTransaction(async (tx) => {
    // 件数の再計算(項目の全件読取)より安価なメンバー確認を先に行い、物理削除済みの
    // リスト(項目だけ順次消えていく途中)では項目を読まずに終える。
    const membersSnap = await tx.get(listRef.collection("members"));
    if (membersSnap.empty) {
      return;
    }

    const listRefs = membersSnap.docs.map((memberDoc) =>
      db.collection("users").doc(memberDoc.id).collection("listRefs").doc(listId)
    );
    const [itemsSnap, listRefSnaps] = await Promise.all([
      tx.get(listRef.collection("items").where("deletedAt", "==", null)),
      tx.getAll(...listRefs),
    ]);
    const counts = computeItemCounts(
      itemsSnap.docs.map((doc: { data: () => DocumentData }) => doc.data() as { completedAt: unknown })
    );

    for (const snap of listRefSnaps) {
      const current = snap.data();
      if (!snap.exists || (current?.totalCount === counts.totalCount && current?.completedCount === counts.completedCount)) {
        continue;
      }
      tx.update(snap.ref, counts);
    }
  });
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
