import type { ListItem } from '@soroe/shared';

// LIST-04/LIST-005: 詳細画面の表示・フィルター・並べ替えを画面から切り出した
// 純粋関数群。itemsは呼び出し側でsortOrder昇順に並んでいる前提
// (subscribeToListItemsのFirestoreクエリで保証される)。

export type ItemFilters = {
  onlyIncomplete: boolean;
  category: string | null;
  assigneeId: string | null;
  search: string;
};

export const DEFAULT_ITEM_FILTERS: ItemFilters = {
  onlyIncomplete: false,
  category: null,
  assigneeId: null,
  search: '',
};

export function isItemFilterActive(filters: ItemFilters): boolean {
  return filters.onlyIncomplete || filters.category !== null || filters.assigneeId !== null || filters.search.trim() !== '';
}

/** カテゴリ・担当者・検索語での絞り込み。「未完了のみ」はセクション分けと併せて扱う。 */
export function filterListItems(items: ListItem[], filters: ItemFilters): ListItem[] {
  const search = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.category !== null && item.category !== filters.category) {
      return false;
    }
    if (filters.assigneeId !== null && item.assigneeId !== filters.assigneeId) {
      return false;
    }
    if (search !== '' && !item.name.toLowerCase().includes(search)) {
      return false;
    }
    return true;
  });
}

export type ItemSection = {
  // nullは「見出し無しでそのまま並べる」セクション(カテゴリが1件も無いリスト)。
  title: string | null;
  items: ListItem[];
};

const UNCATEGORIZED_TITLE = 'その他';
const COMPLETED_TITLE = '完了';

/**
 * 未完了を上・完了済みを下に、カテゴリがあれば見出しで束ねて並べる
 * (soroe-functional-specification.md LIST-04)。
 */
export function buildItemSections(items: ListItem[], onlyIncomplete: boolean): ItemSection[] {
  const incomplete = items.filter((item) => item.completedAt === null);
  const completed = onlyIncomplete ? [] : items.filter((item) => item.completedAt !== null);

  const sections: ItemSection[] = [];
  const categoryOrder: string[] = [];
  const byCategory = new Map<string, ListItem[]>();
  const uncategorized: ListItem[] = [];

  for (const item of incomplete) {
    if (item.category) {
      if (!byCategory.has(item.category)) {
        categoryOrder.push(item.category);
        byCategory.set(item.category, []);
      }
      byCategory.get(item.category)!.push(item);
    } else {
      uncategorized.push(item);
    }
  }

  if (categoryOrder.length > 0) {
    for (const category of categoryOrder) {
      sections.push({ title: category, items: byCategory.get(category)! });
    }
    if (uncategorized.length > 0) {
      sections.push({ title: UNCATEGORIZED_TITLE, items: uncategorized });
    }
  } else if (incomplete.length > 0) {
    sections.push({ title: null, items: incomplete });
  }

  if (completed.length > 0) {
    sections.push({ title: COMPLETED_TITLE, items: completed });
  }

  return sections;
}

export function uniqueCategories(items: ListItem[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (item.category && !seen.has(item.category)) {
      seen.add(item.category);
      result.push(item.category);
    }
  }
  return result;
}

/** 同名項目の警告(削除されていない項目のみ対象、大小文字と前後空白は無視)。 */
export function hasDuplicateItemName(items: ListItem[], name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return items.some((item) => item.name.trim().toLowerCase() === normalized);
}

export function nextAppendSortOrder(items: ListItem[]): number {
  if (items.length === 0) {
    return 1000;
  }
  return Math.max(...items.map((item) => item.sortOrder)) + 1000;
}

export type ReorderDirection = 'up' | 'down';

/**
 * 長押しでの手動並べ替え(LIST-005)。隣接2件の中間値を割り当てて、
 * 移動のたびに他の項目のsortOrderを再採番しないようにする
 * (packages/shared/src/schemas/list.tsのsortOrderコメント参照)。
 */
export function moveItemSortOrder(
  items: ListItem[],
  itemId: string,
  direction: ReorderDirection
): number | null {
  const index = items.findIndex((item) => item.id === itemId);
  if (index === -1) {
    return null;
  }

  if (direction === 'up') {
    if (index === 0) {
      return null;
    }
    const after = items[index - 1].sortOrder;
    const before = items[index - 2]?.sortOrder;
    return before !== undefined ? (before + after) / 2 : after - 1;
  }

  if (index === items.length - 1) {
    return null;
  }
  const before = items[index + 1].sortOrder;
  const after = items[index + 2]?.sortOrder;
  return after !== undefined ? (before + after) / 2 : before + 1;
}

/** ListRowのmeta表示。数量・単位、担当、期限をこの優先順で1行にまとめる。 */
export function formatItemMeta(item: ListItem, currentUid: string): string | undefined {
  const parts: string[] = [];
  if (item.quantity !== null) {
    parts.push(item.unit ? `${item.quantity}${item.unit}` : `${item.quantity}`);
  }
  if (item.assigneeId !== null) {
    parts.push(item.assigneeId === currentUid ? '自分' : 'メンバー');
  }
  if (item.dueAt !== null) {
    // 期限は「日付」であり時刻を持たないため、端末タイムゾーンでずれないよう
    // UTC基準のカレンダー値をそのまま表示する(item-edit.tsxもUTC正午で保存する)。
    const date = new Date(item.dueAt);
    parts.push(`${date.getUTCMonth() + 1}/${date.getUTCDate()}`);
  }
  return parts.length > 0 ? parts.join(' ・ ') : undefined;
}
