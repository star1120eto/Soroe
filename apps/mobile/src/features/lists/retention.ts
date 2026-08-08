// LIST-006: 削除済みリストの残り復元可能日数の表示用。
// functions/src/lists/retention.tsのDELETED_LIST_RETENTION_DAYSと値を揃える。
const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function daysRemainingUntilPurge(deletedAtMillis: number, nowMillis: number): number {
  const elapsedDays = Math.floor((nowMillis - deletedAtMillis) / DAY_MS);
  return Math.max(0, RETENTION_DAYS - elapsedDays);
}
