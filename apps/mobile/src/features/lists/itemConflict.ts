import type { ListItem } from '@soroe/shared';

import { formatDueDateInput } from './dueDate';

// SYNC-01 / ITEM-01: 項目編集の競合判定。画面から切り出してテストしやすくする。
// 「自分が変えた項目」と「他のメンバーが変えた項目」が重なったときだけ比較確認を出し、
// 重ならなければ自分が変えた項目だけを保存する(別の項目の変更は消さない)。
export type EditableField =
  | 'name'
  | 'quantity'
  | 'unit'
  | 'category'
  | 'note'
  | 'assigneeId'
  | 'dueAt'
  | 'completed';

export type EditableValues = Pick<
  ListItem,
  'name' | 'quantity' | 'unit' | 'category' | 'note' | 'assigneeId' | 'dueAt'
> & { completed: boolean };

const FIELDS: EditableField[] = ['name', 'quantity', 'unit', 'category', 'note', 'assigneeId', 'dueAt', 'completed'];

const FIELD_LABEL: Record<EditableField, string> = {
  name: '項目名',
  quantity: '数量',
  unit: '単位',
  category: 'カテゴリ',
  note: 'メモ',
  assigneeId: '担当者',
  dueAt: '期限',
  completed: '完了',
};

export function toEditableValues(item: ListItem): EditableValues {
  return {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    note: item.note,
    assigneeId: item.assigneeId,
    dueAt: item.dueAt,
    completed: item.completedAt !== null,
  };
}

export function changedFields(base: EditableValues, next: EditableValues): EditableField[] {
  return FIELDS.filter((field) => base[field] !== next[field]);
}

export function analyzeConflict(
  base: EditableValues,
  mine: EditableValues,
  latest: EditableValues
): { remoteChanged: EditableField[]; overlapping: EditableField[] } {
  const mineChanged = changedFields(base, mine);
  const remoteChanged = changedFields(base, latest);
  // 両方が変え、かつ結果が違うときだけ競合(同じ値へ変えたなら食い違いは無い)。
  const overlapping = mineChanged.filter((field) => remoteChanged.includes(field) && mine[field] !== latest[field]);
  return { remoteChanged, overlapping };
}

export type SaveResolution =
  | { action: 'noop' }
  | { action: 'deleted' }
  | { action: 'save'; fields: EditableField[] }
  | { action: 'confirm'; fields: EditableField[]; overlapping: EditableField[] };

export function resolveSave(args: {
  base: EditableValues;
  mine: EditableValues;
  latest: ListItem | null;
}): SaveResolution {
  const { base, mine, latest } = args;
  // 削除を優先する(SYNC-01)。
  if (latest === null) {
    return { action: 'deleted' };
  }
  const fields = changedFields(base, mine);
  if (fields.length === 0) {
    return { action: 'noop' };
  }
  const { overlapping } = analyzeConflict(base, mine, toEditableValues(latest));
  if (overlapping.length > 0) {
    return { action: 'confirm', fields, overlapping };
  }
  return { action: 'save', fields };
}

function display(field: EditableField, value: EditableValues[EditableField]): string {
  if (value === null || value === '') {
    return 'なし';
  }
  if (field === 'completed') {
    return value ? '完了' : '未完了';
  }
  if (field === 'dueAt' && typeof value === 'number') {
    return formatDueDateInput(value);
  }
  return String(value);
}

export function formatConflictMessage(
  overlapping: EditableField[],
  mine: EditableValues,
  latest: EditableValues
): string {
  return overlapping
    .map((field) => `${FIELD_LABEL[field]}: あなた「${display(field, mine[field])}」/相手「${display(field, latest[field])}」`)
    .join('\n');
}
