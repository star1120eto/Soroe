// TMPL-02: 項目の選択。初期状態は全項目が選択済みで、不要な項目を外す。

export function initialSelection(itemIds: string[]): Set<string> {
  return new Set(itemIds);
}

export function toggleSelection(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}
