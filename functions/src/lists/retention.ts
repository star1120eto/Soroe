import { DELETED_LIST_RETENTION_DAYS } from "./constants";

const RETENTION_MS = DELETED_LIST_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// 純粋関数: restoreList/purgeExpiredDeletedListsの両方から使う
// (soroe-functional-specification.md LIST-05「30日経過後に物理削除する」)。
export function isWithinRestoreWindow(deletedAtMillis: number, nowMillis: number): boolean {
  return nowMillis - deletedAtMillis < RETENTION_MS;
}

export function retentionCutoffMillis(nowMillis: number): number {
  return nowMillis - RETENTION_MS;
}
