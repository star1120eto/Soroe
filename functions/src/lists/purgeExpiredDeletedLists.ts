import type { Firestore } from "firebase-admin/firestore";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { retentionCutoffMillis } from "./retention";

type Db = Pick<Firestore, "collection" | "batch">;

async function purgeList(db: Db, listId: string): Promise<void> {
  const listRef = db.collection("lists").doc(listId);
  const [itemsSnap, membersSnap] = await Promise.all([
    listRef.collection("items").get(),
    listRef.collection("members").get(),
  ]);

  const batch = db.batch();
  for (const itemDoc of itemsSnap.docs) {
    batch.delete(itemDoc.ref);
  }
  for (const memberDoc of membersSnap.docs) {
    batch.delete(memberDoc.ref);
    // 削除済みリストは全メンバーから非表示にしているが(LIST-05)、
    // listRefドキュメント自体はここで初めて消える。
    batch.delete(db.collection("users").doc(memberDoc.id).collection("listRefs").doc(listId));
  }
  batch.delete(listRef);
  await batch.commit();
}

/**
 * 論理削除から30日経過したリストを物理削除する(soroe-functional-specification.md
 * LIST-05)。日次スケジュール実行を想定し、nowMillisを渡してテスト可能にする。
 */
export async function purgeExpiredDeletedListsHandler(db: Db, nowMillis: number): Promise<{ purgedCount: number }> {
  const cutoff = Timestamp.fromMillis(retentionCutoffMillis(nowMillis));
  const expiredSnap = await db.collection("lists").where("deletedAt", "<=", cutoff).get();

  let purgedCount = 0;
  for (const listDoc of expiredSnap.docs) {
    try {
      await purgeList(db, listDoc.id);
      purgedCount += 1;
    } catch (error) {
      // 1件が異常に大きい(500件超のitems/members)等で失敗しても、他の期限切れ
      // リストの物理削除を止めない。失敗分は翌日の実行で再試行される。
      console.error(`purgeExpiredDeletedLists: failed to purge list ${listDoc.id}`, error);
    }
  }

  return { purgedCount };
}

export const purgeExpiredDeletedLists = onSchedule("every 24 hours", async () => {
  await purgeExpiredDeletedListsHandler(getFirestore(), Date.now());
});
