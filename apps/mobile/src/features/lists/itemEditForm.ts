import type { UpdateListItemInput } from '@soroe/shared';

import { parseDueDateInput } from './dueDate';

// ITEM-01: 項目編集フォームの入力状態とバリデーション。画面から切り出して
// テストしやすくする。数量・単位はshowQuantityUnitがfalseの種別(やること)では
// 常にnullにする(そのリスト種別の項目は元々これらを持たない)。
export type ItemEditFormState = {
  name: string;
  quantity: string;
  unit: string;
  category: string;
  note: string;
  assigneeId: string | null;
  dueAt: string;
};

export type ItemEditValidationResult =
  | { ok: true; input: UpdateListItemInput }
  | { ok: false; error: string };

export function validateItemEditForm(
  state: ItemEditFormState,
  showQuantityUnit: boolean,
  showDueDate: boolean
): ItemEditValidationResult {
  const name = state.name.trim();
  if (name.length < 1 || name.length > 100) {
    return { ok: false, error: '項目名は1〜100文字で入力してください' };
  }

  const note = state.note.trim();
  if (note.length > 500) {
    return { ok: false, error: 'メモは500文字以内で入力してください' };
  }

  let quantity: number | null = null;
  let unit: string | null = null;
  if (showQuantityUnit) {
    const quantityText = state.quantity.trim();
    if (quantityText !== '') {
      const parsedQuantity = Number(quantityText);
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
        return { ok: false, error: '数量は0より大きい数値で入力してください' };
      }
      quantity = parsedQuantity;
    }

    const unitText = state.unit.trim();
    if (unitText.length > 20) {
      return { ok: false, error: '単位は20文字以内で入力してください' };
    }
    unit = unitText || null;
  }

  let dueAt: number | null = null;
  if (showDueDate) {
    const parsedDate = parseDueDateInput(state.dueAt);
    if (!parsedDate.ok) {
      return { ok: false, error: '期限はYYYY-MM-DD形式で入力してください' };
    }
    dueAt = parsedDate.millis;
  }

  return {
    ok: true,
    input: {
      name,
      quantity,
      unit,
      category: state.category.trim() || null,
      note: note || null,
      assigneeId: state.assigneeId,
      dueAt,
    },
  };
}
