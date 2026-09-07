import type { ListItem } from '@soroe/shared';

import {
  DEFAULT_ITEM_FILTERS,
  buildItemSections,
  filterListItems,
  formatItemMeta,
  hasDuplicateItemName,
  isItemFilterActive,
  moveItemSortOrder,
  nextAppendSortOrder,
  uniqueCategories,
} from '../itemSections';

function item(overrides: Partial<ListItem> & { id: string; sortOrder: number }): ListItem {
  return {
    listId: 'list-1',
    name: '項目',
    quantity: null,
    unit: null,
    category: null,
    note: null,
    assigneeId: null,
    dueAt: null,
    completedAt: null,
    completedBy: null,
    createdBy: 'uid-1',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

describe('filterListItems', () => {
  const items = [
    item({ id: '1', sortOrder: 1, name: '牛乳', category: '冷蔵', assigneeId: 'uid-1' }),
    item({ id: '2', sortOrder: 2, name: 'パン', category: '主食', assigneeId: 'uid-2' }),
    item({ id: '3', sortOrder: 3, name: 'ヨーグルト', category: '冷蔵' }),
  ];

  it('returns everything when no filter is active', () => {
    expect(filterListItems(items, DEFAULT_ITEM_FILTERS)).toHaveLength(3);
  });

  it('filters by category', () => {
    const result = filterListItems(items, { ...DEFAULT_ITEM_FILTERS, category: '冷蔵' });
    expect(result.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('filters by assignee', () => {
    const result = filterListItems(items, { ...DEFAULT_ITEM_FILTERS, assigneeId: 'uid-2' });
    expect(result.map((i) => i.id)).toEqual(['2']);
  });

  it('filters by a case-insensitive search substring', () => {
    const result = filterListItems(items, { ...DEFAULT_ITEM_FILTERS, search: 'パン' });
    expect(result.map((i) => i.id)).toEqual(['2']);
  });
});

describe('isItemFilterActive', () => {
  it('is false for the default filters', () => {
    expect(isItemFilterActive(DEFAULT_ITEM_FILTERS)).toBe(false);
  });

  it('is true when any dimension is set', () => {
    expect(isItemFilterActive({ ...DEFAULT_ITEM_FILTERS, onlyIncomplete: true })).toBe(true);
    expect(isItemFilterActive({ ...DEFAULT_ITEM_FILTERS, search: '  ' })).toBe(false);
    expect(isItemFilterActive({ ...DEFAULT_ITEM_FILTERS, search: 'x' })).toBe(true);
  });
});

describe('buildItemSections', () => {
  it('puts a single unheaded section when no item has a category', () => {
    const items = [item({ id: '1', sortOrder: 1 }), item({ id: '2', sortOrder: 2 })];
    expect(buildItemSections(items, false)).toEqual([{ title: null, items }]);
  });

  it('groups incomplete items by category in first-seen order, uncategorized last', () => {
    const items = [
      item({ id: '1', sortOrder: 1, category: '冷蔵' }),
      item({ id: '2', sortOrder: 2 }),
      item({ id: '3', sortOrder: 3, category: '主食' }),
      item({ id: '4', sortOrder: 4, category: '冷蔵' }),
    ];
    const sections = buildItemSections(items, false);
    expect(sections.map((s) => s.title)).toEqual(['冷蔵', '主食', 'その他']);
    expect(sections[0].items.map((i) => i.id)).toEqual(['1', '4']);
  });

  it('puts completed items in a trailing 完了 section', () => {
    const items = [
      item({ id: '1', sortOrder: 1 }),
      item({ id: '2', sortOrder: 2, completedAt: 100, completedBy: 'uid-1' }),
    ];
    const sections = buildItemSections(items, false);
    expect(sections.map((s) => s.title)).toEqual([null, '完了']);
  });

  it('hides the 完了 section when onlyIncomplete is true', () => {
    const items = [
      item({ id: '1', sortOrder: 1 }),
      item({ id: '2', sortOrder: 2, completedAt: 100, completedBy: 'uid-1' }),
    ];
    expect(buildItemSections(items, true).map((s) => s.title)).toEqual([null]);
  });

  it('returns no sections for an empty list', () => {
    expect(buildItemSections([], false)).toEqual([]);
  });
});

describe('uniqueCategories', () => {
  it('returns categories in first-seen order without duplicates', () => {
    const items = [
      item({ id: '1', sortOrder: 1, category: 'B' }),
      item({ id: '2', sortOrder: 2, category: 'A' }),
      item({ id: '3', sortOrder: 3, category: 'B' }),
      item({ id: '4', sortOrder: 4 }),
    ];
    expect(uniqueCategories(items)).toEqual(['B', 'A']);
  });
});

describe('hasDuplicateItemName', () => {
  const items = [item({ id: '1', sortOrder: 1, name: '牛乳' })];

  it('matches regardless of case and surrounding whitespace', () => {
    expect(hasDuplicateItemName(items, '  牛乳  ')).toBe(true);
    expect(hasDuplicateItemName(items, 'Milk')).toBe(false);
  });

  it('is false when nothing matches', () => {
    expect(hasDuplicateItemName(items, 'パン')).toBe(false);
  });
});

describe('nextAppendSortOrder', () => {
  it('starts at 1000 for an empty list', () => {
    expect(nextAppendSortOrder([])).toBe(1000);
  });

  it('appends after the current maximum', () => {
    const items = [item({ id: '1', sortOrder: 500 }), item({ id: '2', sortOrder: 250 })];
    expect(nextAppendSortOrder(items)).toBe(1500);
  });
});

describe('moveItemSortOrder', () => {
  const items = [item({ id: '1', sortOrder: 100 }), item({ id: '2', sortOrder: 200 }), item({ id: '3', sortOrder: 300 })];

  it('returns null when moving the first item up', () => {
    expect(moveItemSortOrder(items, '1', 'up')).toBeNull();
  });

  it('returns null when moving the last item down', () => {
    expect(moveItemSortOrder(items, '3', 'down')).toBeNull();
  });

  it('returns null for an unknown item id', () => {
    expect(moveItemSortOrder(items, 'missing', 'up')).toBeNull();
  });

  it('assigns a value below the sole neighbor when moving to the top', () => {
    expect(moveItemSortOrder(items, '2', 'up')).toBe(99);
  });

  it('assigns a value above the sole neighbor when moving to the bottom', () => {
    expect(moveItemSortOrder(items, '2', 'down')).toBe(301);
  });

  it('assigns the midpoint when moving between two neighbors', () => {
    const four = [...items, item({ id: '4', sortOrder: 400 })];
    // '3' moves up past '2' (100/200) -> lands between them at 150.
    expect(moveItemSortOrder(four, '3', 'up')).toBe(150);
    // '2' moves down past '3' (300/400) -> lands between them at 350.
    expect(moveItemSortOrder(four, '2', 'down')).toBe(350);
  });
});

describe('formatItemMeta', () => {
  it('returns undefined when there is nothing to show', () => {
    expect(formatItemMeta(item({ id: '1', sortOrder: 1 }), 'uid-1')).toBeUndefined();
  });

  it('combines quantity, unit, assignee and due date', () => {
    const result = formatItemMeta(
      item({ id: '1', sortOrder: 1, quantity: 2, unit: '本', assigneeId: 'uid-1', dueAt: Date.UTC(2026, 7, 10) }),
      'uid-1'
    );
    expect(result).toBe('2本 ・ 自分 ・ 8/10');
  });

  it('shows a quantity without a unit', () => {
    expect(formatItemMeta(item({ id: '1', sortOrder: 1, quantity: 3 }), 'uid-1')).toBe('3');
  });

  it('labels another member generically (no cross-user profile access yet)', () => {
    expect(formatItemMeta(item({ id: '1', sortOrder: 1, assigneeId: 'uid-2' }), 'uid-1')).toBe('メンバー');
  });
});
