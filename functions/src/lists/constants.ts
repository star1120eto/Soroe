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

// soroe-functional-specification.md AI-04/9章・定数表。Freeは生涯1回、Premiumは日本時間の暦月20回。
export const FREE_AI_LIFETIME_LIMIT = 1;
export const PREMIUM_AI_MONTHLY_LIMIT = 20;
// 同時に生成できるのは1件。予約がこの時間を過ぎたものは失効とみなす(サーバー側の異常終了に備える)。
export const AI_ACTIVE_TTL_MS = 120_000;
// 1回の生成のタイムアウト(再試行は1回)。
export const AI_TIMEOUT_MS = 30_000;
