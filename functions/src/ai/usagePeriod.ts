// Premiumの月次回数は日本時間(UTC+9)の暦月で数える(定数表「Premium AI回数リセット」)。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstMonthKey(nowMs: number): string {
  const jst = new Date(nowMs + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 日本時間の翌月1日0時(エポックミリ秒)。Premiumの次回リセット。 */
export function nextJstMonthStartMs(nowMs: number): number {
  const jst = new Date(nowMs + JST_OFFSET_MS);
  return Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + 1, 1) - JST_OFFSET_MS;
}
