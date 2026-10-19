import type { AiResult } from '@soroe/shared';

import { addItem, canSave, editItem, removeItem, selectedCount, setTitle, toEditable, toSaveRequest, toggleItem } from '../aiResultEdit';

const item = (name: string) => ({ name, quantity: null, unit: null, category: null, reason: null, priority: 'essential' as const });
const result: AiResult = { title: '日帰り登山', listType: 'packing', category: null, safetyNotice: true, items: [item('水'), item('地図'), item('帽子')] };

describe('editing an AI result', () => {
  it('starts with every item selected and a stable key per item', () => {
    const editable = toEditable(result);

    expect(editable.items.map((i) => i.selected)).toEqual([true, true, true]);
    expect(new Set(editable.items.map((i) => i.key)).size).toBe(3);
    expect(selectedCount(editable)).toBe(3);
  });

  it('toggles, edits and removes an item without touching the others', () => {
    let editable = toEditable(result);
    const [first, second] = editable.items;

    editable = toggleItem(editable, first.key);
    editable = editItem(editable, second.key, { name: '紙の地図', quantity: 2, unit: '枚', reason: '電波がない所用' });
    editable = removeItem(editable, editable.items[2].key);

    expect(editable.items.map((i) => [i.name, i.selected])).toEqual([['水', false], ['紙の地図', true]]);
    expect(editable.items[1]).toMatchObject({ quantity: 2, unit: '枚', reason: '電波がない所用' });
  });

  it('adds an item as selected with a fresh key', () => {
    const editable = addItem(toEditable(result), '  ナイフ  ');

    expect(editable.items).toHaveLength(4);
    expect(editable.items[3]).toMatchObject({ name: 'ナイフ', selected: true, priority: 'nice-to-have' });
    expect(new Set(editable.items.map((i) => i.key)).size).toBe(4);
  });

  it('ignores adding an empty name', () => {
    expect(addItem(toEditable(result), '   ').items).toHaveLength(3);
  });

  it('can save only with a title and 1 to 80 non-empty selected items', () => {
    let editable = toEditable(result);
    expect(canSave(editable)).toBe(true);

    expect(canSave(setTitle(editable, '   '))).toBe(false);
    expect(canSave(setTitle(editable, 'あ'.repeat(61)))).toBe(false);

    const none = editable.items.reduce((acc, i) => toggleItem(acc, i.key), editable);
    expect(canSave(none)).toBe(false);

    editable = editItem(editable, editable.items[0].key, { name: '  ' });
    expect(canSave(editable)).toBe(false);

    let many = toEditable({ ...result, items: [item('a')] });
    for (let index = 0; index < 80; index += 1) many = addItem(many, `項目${index}`);
    expect(selectedCount(many)).toBe(81);
    expect(canSave(many)).toBe(false);
  });

  it('builds a save request from the selected items only, and refuses when it cannot save', () => {
    let editable = toEditable(result);
    editable = toggleItem(editable, editable.items[1].key);

    const request = toSaveRequest('req-1', editable);

    expect(request).toMatchObject({ requestId: 'req-1', title: '日帰り登山', listType: 'packing' });
    expect(request.items.map((i) => i.name)).toEqual(['水', '帽子']);
    expect(Object.keys(request.items[0]).sort()).toEqual(['category', 'name', 'priority', 'quantity', 'reason', 'unit']);

    expect(() => toSaveRequest('req-1', setTitle(editable, ''))).toThrow();
  });
});
