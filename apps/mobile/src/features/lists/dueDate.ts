// ITEM-01: 「やること」の期限入力。日付ピッカーのネイティブmoduleを追加すると
// EAS Development Buildの再作成が要る(AGENTS.md/ENV-002)ため、MVPでは
// YYYY-MM-DD形式のテキスト入力に留める。正午UTCで保存し、端末タイムゾーンに
// よって前後の日付へずれないようにする(itemSections.tsのformatItemMetaも参照)。

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DueDateParseResult = { ok: true; millis: number | null } | { ok: false };

export function parseDueDateInput(text: string): DueDateParseResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: true, millis: null };
  }

  const match = trimmed.match(DATE_INPUT_PATTERN);
  if (!match) {
    return { ok: false };
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const millis = Date.UTC(year, month - 1, day, 12);

  // 2/30のような存在しない日付はDate.UTCが繰り上げて解釈するため、
  // 往復させて一致しなければ拒否する。
  const roundTrip = new Date(millis);
  const isValidDate =
    roundTrip.getUTCFullYear() === year && roundTrip.getUTCMonth() === month - 1 && roundTrip.getUTCDate() === day;

  return isValidDate ? { ok: true, millis } : { ok: false };
}

export function formatDueDateInput(millis: number | null): string {
  if (millis === null) {
    return '';
  }
  const date = new Date(millis);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
