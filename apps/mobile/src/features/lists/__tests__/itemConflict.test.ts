import type { ListItem } from '@soroe/shared';

import {
  analyzeConflict,
  changedFields,
  formatConflictMessage,
  resolveSave,
  toEditableValues,
  type EditableValues,
} from '../itemConflict';

const base: EditableValues = {
  name: '牛乳',
  quantity: 1,
  unit: '本',
  category: null,
  note: null,
  assigneeId: null,
  dueAt: null,
  completed: false,
};

function item(overrides: Partial<EditableValues> = {}): ListItem {
  const values = { ...base, ...overrides };
  return {
    id: 'item-1',
    listId: 'list-1',
    name: values.name,
    quantity: values.quantity,
    unit: values.unit,
    category: values.category,
    note: values.note,
    assigneeId: values.assigneeId,
    dueAt: values.dueAt,
    completedAt: values.completed ? 2 : null,
    completedBy: values.completed ? 'uid' : null,
    sortOrder: 1000,
    createdBy: 'uid',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  };
}

describe('toEditableValues', () => {
  it('maps completedAt to the completed flag', () => {
    expect(toEditableValues(item({ completed: true })).completed).toBe(true);
    expect(toEditableValues(item()).completed).toBe(false);
  });
});

describe('changedFields', () => {
  it('returns only the fields that differ', () => {
    expect(changedFields(base, { ...base, name: '豆乳' })).toEqual(['name']);
    expect(changedFields(base, { ...base, note: 'メモ', completed: true })).toEqual(['note', 'completed']);
  });

  it('returns nothing when nothing changed', () => {
    expect(changedFields(base, { ...base })).toEqual([]);
  });
});

describe('analyzeConflict', () => {
  it('does not overlap when the two sides changed different fields', () => {
    const result = analyzeConflict(base, { ...base, note: 'メモ' }, { ...base, name: '豆乳' });
    expect(result.remoteChanged).toEqual(['name']);
    expect(result.overlapping).toEqual([]);
  });

  it('overlaps when both sides changed the same field to different values', () => {
    const result = analyzeConflict(base, { ...base, name: 'B' }, { ...base, name: 'C' });
    expect(result.overlapping).toEqual(['name']);
  });

  it('does not overlap when both sides changed the same field to the same value', () => {
    const result = analyzeConflict(base, { ...base, name: 'B' }, { ...base, name: 'B' });
    expect(result.overlapping).toEqual([]);
  });
});

describe('resolveSave', () => {
  it('is a noop when the user changed nothing', () => {
    expect(resolveSave({ base, mine: { ...base }, latest: item() })).toEqual({ action: 'noop' });
  });

  it('reports a deleted item when the latest item is gone', () => {
    expect(resolveSave({ base, mine: { ...base, name: 'B' }, latest: null })).toEqual({ action: 'deleted' });
  });

  it('saves only the changed fields when nobody else touched them', () => {
    const result = resolveSave({
      base,
      mine: { ...base, note: 'メモ' },
      latest: item({ name: '豆乳' }),
    });
    expect(result).toEqual({ action: 'save', fields: ['note'] });
  });

  it('asks for confirmation when the same field was changed differently', () => {
    const result = resolveSave({
      base,
      mine: { ...base, name: 'B' },
      latest: item({ name: 'C' }),
    });
    expect(result).toEqual({ action: 'confirm', fields: ['name'], overlapping: ['name'] });
  });
});

describe('formatConflictMessage', () => {
  it('lists each overlapping field with both values', () => {
    const message = formatConflictMessage(['name'], { ...base, name: 'B' }, { ...base, name: 'C' });
    expect(message).toBe('項目名: あなた「B」/相手「C」');
  });

  it('shows なし for unset values', () => {
    const message = formatConflictMessage(['note'], { ...base, note: 'メモ' }, { ...base, note: null });
    expect(message).toBe('メモ: あなた「メモ」/相手「なし」');
  });
});
