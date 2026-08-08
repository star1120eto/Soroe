// LIST-04 高速入力補助: 「牛乳 2本」のような入力から数量・単位を抽出する。
// soroe-functional-specification.md: 「抽出に失敗しても文字列全体を項目名として
// 追加できる」ため、パース失敗時は例外を投げず常に名前だけのフォールバックを返す。

export type QuickAddParseResult = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

// 名前 + 空白区切り + 数量 + (任意で)単位、の並びだけを拾う。単位は最大20文字
// (listItemSchemaのunit上限に合わせる)。空白の無い「卵6個」のような表記は
// 名前と数量の境界が曖昧になるため対象外とし、名前全体として扱う。
const QUICK_ADD_PATTERN = /^(.+?)[\s　]+([0-9]+(?:\.[0-9]+)?)(?:[\s　]*([^\s　0-9]{1,20}))?$/;

export function parseQuickAddInput(raw: string): QuickAddParseResult {
  const trimmed = raw.trim();
  const match = trimmed.match(QUICK_ADD_PATTERN);

  if (!match) {
    return { name: trimmed, quantity: null, unit: null };
  }

  const [, namePart, quantityPart, unitPart] = match;
  const name = namePart.trim();
  const quantity = Number(quantityPart);

  if (!name || !Number.isFinite(quantity) || quantity <= 0) {
    return { name: trimmed, quantity: null, unit: null };
  }

  return { name, quantity, unit: unitPart ? unitPart.trim() : null };
}
