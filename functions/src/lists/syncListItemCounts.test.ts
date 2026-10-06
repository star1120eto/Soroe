import { describe, expect, it, vi } from "vitest";

import { computeItemCounts, syncListItemCountsHandler } from "./syncListItemCounts";

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

function fakeDb(itemDocs: { completedAt: unknown }[], memberUids: string[]) {
  const itemsGet = vi.fn().mockResolvedValue({ docs: itemDocs.map((data) => ({ data: () => data })) });
  const itemsWhere = vi.fn(() => ({ get: itemsGet }));
  const membersGet = vi.fn().mockResolvedValue({
    empty: memberUids.length === 0,
    docs: memberUids.map((uid) => ({ id: uid })),
  });
  const set = vi.fn();
  const commit = vi.fn().mockResolvedValue(undefined);
  const usersDoc = vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ marker: "listRef" })),
    })),
  }));

  const listsCollection = {
    doc: vi.fn(() => ({
      collection: vi.fn((name: string) => {
        if (name === "items") {
          return { where: itemsWhere };
        }
        return { get: membersGet };
      }),
    })),
  };

  const usersCollection = { doc: usersDoc };

  const db = {
    collection: vi.fn((name: string) => (name === "lists" ? listsCollection : usersCollection)),
    batch: vi.fn(() => ({ set, commit })),
  };

  return { db, set, commit, itemsWhere, usersDoc };
}

describe("syncListItemCountsHandler", () => {
  it("propagates counts to every member's listRef", async () => {
    const { db, set, commit, itemsWhere, usersDoc } = fakeDb(
      [{ completedAt: null }, { completedAt: "done" }],
      ["owner-uid", "editor-uid"]
    );

    await syncListItemCountsHandler(db as never, "list-1");

    expect(itemsWhere).toHaveBeenCalledWith("deletedAt", "==", null);
    expect(set).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledOnce();
    const [, patch, options] = set.mock.calls[0];
    expect(patch).toEqual({ totalCount: 2, completedCount: 1 });
    expect(options).toEqual({ merge: true });
    expect(usersDoc).toHaveBeenCalledWith("owner-uid");
    expect(usersDoc).toHaveBeenCalledWith("editor-uid");
  });

  it("does nothing when the list has no members", async () => {
    const { db, set, commit } = fakeDb([], []);

    await syncListItemCountsHandler(db as never, "list-1");

    expect(set).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});
