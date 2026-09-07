import { describe, expect, it, vi } from "vitest";

import { FIRESTORE_BATCH_CHUNK_SIZE } from "./constants";
import { copyItemsInChunks } from "./listStore";

function fakeDb() {
  const committedSets: { path: string; data: unknown }[] = [];
  const commitCallSizes: number[] = [];

  const batch = vi.fn(() => {
    const pending: { path: string; data: unknown }[] = [];
    return {
      set: (ref: { path: string }, data: unknown) => pending.push({ path: ref.path, data }),
      commit: () => {
        commitCallSizes.push(pending.length);
        committedSets.push(...pending);
        return Promise.resolve();
      },
    };
  });

  let nextId = 0;
  const itemsCollection = {
    doc: () => ({ path: `lists/new-list/items/generated-${nextId++}` }),
  };

  const db = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => itemsCollection),
      })),
    })),
    batch,
  };

  return { db, committedSets, commitCallSizes };
}

function sourceItem(overrides: Record<string, unknown>) {
  return {
    name: "牛乳",
    quantity: 2,
    unit: "本",
    category: "冷蔵",
    note: "メモ",
    assigneeId: "original-assignee",
    dueAt: 123,
    completedAt: 456,
    completedBy: "original-uid",
    sortOrder: 1000,
    ...overrides,
  };
}

describe("copyItemsInChunks", () => {
  it("does nothing for an empty list", async () => {
    const { db, committedSets, commitCallSizes } = fakeDb();

    await copyItemsInChunks(db as never, "new-list", "uid-1", []);

    expect(committedSets).toHaveLength(0);
    expect(commitCallSizes).toHaveLength(0);
  });

  it("writes all items in a single batch when under the chunk size", async () => {
    const { db, committedSets, commitCallSizes } = fakeDb();
    const items = [sourceItem({ sortOrder: 1000 }), sourceItem({ sortOrder: 2000 })];

    await copyItemsInChunks(db as never, "new-list", "uid-1", items);

    expect(commitCallSizes).toEqual([2]);
    expect(committedSets).toHaveLength(2);
  });

  it("splits into multiple batches when the item count exceeds the chunk size", async () => {
    const { db, committedSets, commitCallSizes } = fakeDb();
    const items = Array.from({ length: FIRESTORE_BATCH_CHUNK_SIZE + 1 }, (_, i) => sourceItem({ sortOrder: i }));

    await copyItemsInChunks(db as never, "new-list", "uid-1", items);

    expect(commitCallSizes).toEqual([FIRESTORE_BATCH_CHUNK_SIZE, 1]);
    expect(committedSets).toHaveLength(FIRESTORE_BATCH_CHUNK_SIZE + 1);
  });

  it("resets completion, assignee and due date but keeps name/quantity/unit/category/note/sortOrder", async () => {
    const { db, committedSets } = fakeDb();
    const item = sourceItem({});

    await copyItemsInChunks(db as never, "new-list", "new-owner-uid", [item]);

    expect(committedSets[0].data).toMatchObject({
      name: "牛乳",
      quantity: 2,
      unit: "本",
      category: "冷蔵",
      note: "メモ",
      sortOrder: 1000,
      assigneeId: null,
      dueAt: null,
      completedAt: null,
      completedBy: null,
      createdBy: "new-owner-uid",
      deletedAt: null,
    });
  });

  it("defaults missing optional fields to null", async () => {
    const { db, committedSets } = fakeDb();
    const item = sourceItem({ quantity: undefined, unit: undefined, category: undefined, note: undefined });

    await copyItemsInChunks(db as never, "new-list", "uid-1", [item]);

    expect(committedSets[0].data).toMatchObject({
      quantity: null,
      unit: null,
      category: null,
      note: null,
    });
  });
});
