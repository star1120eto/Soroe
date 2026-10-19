import type { AiResult, AiResultItem, ListType, SaveAiResultRequest } from '@soroe/shared';

// AI-04: 生成結果の編集(選択解除・追加・編集・削除、タイトル・種別の変更)。画面から切り出してテストしやすくする。
const MAX_ITEMS = 80;
const MAX_TITLE = 60;

export type EditableItem = AiResultItem & { key: string; selected: boolean };
export type EditableResult = {
  title: string;
  listType: ListType;
  safetyNotice: boolean;
  items: EditableItem[];
  nextKey: number;
};

export function toEditable(result: AiResult): EditableResult {
  return {
    title: result.title,
    listType: result.listType,
    safetyNotice: result.safetyNotice,
    items: result.items.map((item, index) => ({ ...item, key: `item-${index}`, selected: true })),
    nextKey: result.items.length,
  };
}

const mapItem = (editable: EditableResult, key: string, change: (item: EditableItem) => EditableItem): EditableResult => ({
  ...editable,
  items: editable.items.map((item) => (item.key === key ? change(item) : item)),
});

export const toggleItem = (editable: EditableResult, key: string) => mapItem(editable, key, (item) => ({ ...item, selected: !item.selected }));

export const editItem = (
  editable: EditableResult,
  key: string,
  patch: Partial<Pick<AiResultItem, 'name' | 'quantity' | 'unit' | 'category' | 'reason'>>
) => mapItem(editable, key, (item) => ({ ...item, ...patch }));

export const removeItem = (editable: EditableResult, key: string): EditableResult => ({
  ...editable,
  items: editable.items.filter((item) => item.key !== key),
});

export function addItem(editable: EditableResult, name: string): EditableResult {
  const trimmed = name.trim();
  if (trimmed === '') {
    return editable;
  }
  const item: EditableItem = {
    name: trimmed,
    quantity: null,
    unit: null,
    category: null,
    reason: null,
    priority: 'nice-to-have',
    key: `item-${editable.nextKey}`,
    selected: true,
  };
  return { ...editable, items: [...editable.items, item], nextKey: editable.nextKey + 1 };
}

export const setTitle = (editable: EditableResult, title: string): EditableResult => ({ ...editable, title });
export const setListType = (editable: EditableResult, listType: ListType): EditableResult => ({ ...editable, listType });

export const selectedCount = (editable: EditableResult) => editable.items.filter((item) => item.selected).length;

/** タイトルがあり、選んだ項目が1〜80件で、どの項目名も空でないとき保存できる。 */
export function canSave(editable: EditableResult): boolean {
  const title = editable.title.trim();
  const selected = editable.items.filter((item) => item.selected);
  return (
    title.length >= 1 &&
    title.length <= MAX_TITLE &&
    selected.length >= 1 &&
    selected.length <= MAX_ITEMS &&
    selected.every((item) => item.name.trim() !== '')
  );
}

export function toSaveRequest(requestId: string, editable: EditableResult): SaveAiResultRequest {
  if (!canSave(editable)) {
    throw new Error('保存できない状態です');
  }
  return {
    requestId,
    title: editable.title.trim(),
    listType: editable.listType,
    items: editable.items
      .filter((item) => item.selected)
      .map(({ name, quantity, unit, category, reason, priority }) => ({ name: name.trim(), quantity, unit, category, reason, priority })),
  };
}
