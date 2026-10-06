import { describe, expect, it } from "vitest";

import { computeItemCounts } from "./syncListItemCounts";

// handler本体(transactionでの集計・メンバー削除や物理削除との競合)は実Firestore Emulatorを使う
// src/integration/syncListItemCounts.integration.test.ts で検証する。

describe("computeItemCounts", () => {
  it("returns zero for no items", () => {
    expect(computeItemCounts([])).toEqual({ totalCount: 0, completedCount: 0 });
  });

  it("counts total and completed separately", () => {
    const items = [{ completedAt: null }, { completedAt: "2026-01-01" }, { completedAt: null }];
    expect(computeItemCounts(items)).toEqual({ totalCount: 3, completedCount: 1 });
  });

  it("treats every non-null completedAt as completed", () => {
    const items = [{ completedAt: "a" }, { completedAt: "b" }];
    expect(computeItemCounts(items)).toEqual({ totalCount: 2, completedCount: 2 });
  });

  it("treats a missing completedAt as not completed", () => {
    const items = [{ completedAt: undefined }, { completedAt: "done" }];
    expect(computeItemCounts(items)).toEqual({ totalCount: 2, completedCount: 1 });
  });
});
