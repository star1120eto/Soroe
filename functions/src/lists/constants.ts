// docs/family-checklist-product-design.md 4.1: Freeはアクティブリスト合計3件。
export const FREE_ACTIVE_LIST_LIMIT = 3;

// soroe-functional-specification.md LIST-05: 削除から30日は復元でき、
// 経過後に物理削除する。
export const DELETED_LIST_RETENTION_DAYS = 30;

// FirestoreのWriteBatch/transactionは1回あたり500書込までのため、余裕を
// 持って400件ずつに分ける(duplicateListTransactionの項目複製、
// purgeExpiredDeletedListsの物理削除で共通して使う)。
export const FIRESTORE_BATCH_CHUNK_SIZE = 400;

// docs/family-checklist-product-design.md 4.1 / 6.8: Freeのマイテンプレートは1件。
export const FREE_MY_TEMPLATE_LIMIT = 1;
