import { validateItemEditForm, type ItemEditFormState } from '../itemEditForm';

function baseState(overrides: Partial<ItemEditFormState> = {}): ItemEditFormState {
  return {
    name: 'トマト',
    quantity: '',
    unit: '',
    category: '',
    note: '',
    assigneeId: null,
    dueAt: '',
    ...overrides,
  };
}

describe('validateItemEditForm', () => {
  it('accepts a minimal valid name-only form', () => {
    const result = validateItemEditForm(baseState(), false, false);
    expect(result).toEqual({
      ok: true,
      input: { name: 'トマト', quantity: null, unit: null, category: null, note: null, assigneeId: null, dueAt: null },
    });
  });

  it.each(['', ' ', 'あ'.repeat(101)])('rejects an invalid name %j', (name) => {
    expect(validateItemEditForm(baseState({ name }), false, false).ok).toBe(false);
  });

  it('rejects a note over 500 characters', () => {
    const result = validateItemEditForm(baseState({ note: 'あ'.repeat(501) }), false, false);
    expect(result.ok).toBe(false);
  });

  it('parses quantity and unit when shown', () => {
    const result = validateItemEditForm(baseState({ quantity: '2', unit: '本' }), true, false);
    expect(result.ok).toBe(true);
    expect(result.ok && result.input.quantity).toBe(2);
    expect(result.ok && result.input.unit).toBe('本');
  });

  it('ignores quantity/unit input when the list type does not show them', () => {
    const result = validateItemEditForm(baseState({ quantity: '2', unit: '本' }), false, false);
    expect(result.ok).toBe(true);
    expect(result.ok && result.input.quantity).toBeNull();
    expect(result.ok && result.input.unit).toBeNull();
  });

  it.each(['0', '-1', 'abc'])('rejects an invalid quantity %j', (quantity) => {
    expect(validateItemEditForm(baseState({ quantity }), true, false).ok).toBe(false);
  });

  it('rejects a unit over 20 characters', () => {
    expect(validateItemEditForm(baseState({ unit: 'あ'.repeat(21) }), true, false).ok).toBe(false);
  });

  it('parses a due date only when shown', () => {
    const shown = validateItemEditForm(baseState({ dueAt: '2026-08-10' }), false, true);
    expect(shown.ok).toBe(true);
    expect(shown.ok && shown.input.dueAt).toBe(Date.UTC(2026, 7, 10, 12));

    const hidden = validateItemEditForm(baseState({ dueAt: '2026-08-10' }), false, false);
    expect(hidden.ok).toBe(true);
    expect(hidden.ok && hidden.input.dueAt).toBeNull();
  });

  it('rejects a malformed due date when shown', () => {
    expect(validateItemEditForm(baseState({ dueAt: 'next friday' }), false, true).ok).toBe(false);
  });

  it('treats blank category/note as null', () => {
    const result = validateItemEditForm(baseState({ category: '  ', note: '  ' }), false, false);
    expect(result.ok).toBe(true);
    expect(result.ok && result.input.category).toBeNull();
    expect(result.ok && result.input.note).toBeNull();
  });

  it('passes assigneeId through unchanged', () => {
    const result = validateItemEditForm(baseState({ assigneeId: 'uid-2' }), false, false);
    expect(result.ok).toBe(true);
    expect(result.ok && result.input.assigneeId).toBe('uid-2');
  });
});
