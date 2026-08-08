import { describe, expect, it, vi } from "vitest";

import { purgeExpiredDeletedListsHandler } from "./purgeExpiredDeletedLists";

type FakeDbConfig = {
  expiredListIds: string[];
  itemsByList?: Record<string, string[]>;
  membersByList?: Record<string, string[]>;
};

function fakeDb({ expiredListIds, itemsByList = {}, membersByList = {} }: FakeDbConfig) {
  const deleted: unknown[] = [];
  const batchDelete = vi.fn((ref: unknown) => deleted.push(ref));
  const commit = vi.fn().mockResolvedValue(undefined);
  const batch = vi.fn(() => ({ delete: batchDelete, commit }));

  function listDoc(listId: string) {
    const ref = { path: `lists/${listId}` };
    return {
      ...ref,
      collection: (name: string) => {
        if (name === "items") {
          return {
            get: () =>
              Promise.resolve({
                docs: (itemsByList[listId] ?? []).map((itemId) => ({
                  ref: { path: `lists/${listId}/items/${itemId}` },
                })),
              }),
          };
        }
        if (name === "members") {
          return {
            get: () =>
              Promise.resolve({
                docs: (membersByList[listId] ?? []).map((uid) => ({
                  id: uid,
                  ref: { path: `lists/${listId}/members/${uid}` },
                })),
              }),
          };
        }
        throw new Error(`unexpected subcollection ${name}`);
      },
    };
  }

  const listsCollection = {
    where: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ docs: expiredListIds.map((id) => ({ id })) }),
    }),
    doc: vi.fn((id: string) => listDoc(id)),
  };

  const usersCollection = {
    doc: vi.fn((uid: string) => ({
      collection: vi.fn((name: string) => {
        if (name !== "listRefs") {
          throw new Error(`unexpected ${name}`);
        }
        return { doc: vi.fn((listId: string) => ({ path: `users/${uid}/listRefs/${listId}` })) };
      }),
    })),
  };

  const db = {
    collection: vi.fn((name: string) => (name === "lists" ? listsCollection : usersCollection)),
    batch,
  };

  return { db, deleted, commit, listsWhere: listsCollection.where };
}

describe("purgeExpiredDeletedListsHandler", () => {
  it("does nothing when no list is past the retention window", async () => {
    const { db, deleted, commit } = fakeDb({ expiredListIds: [] });

    const result = await purgeExpiredDeletedListsHandler(db as never, 1_000_000);

    expect(result).toEqual({ purgedCount: 0 });
    expect(deleted).toHaveLength(0);
    expect(commit).not.toHaveBeenCalled();
  });

  it("deletes every item, member, listRef and the list itself", async () => {
    const { db, deleted, commit } = fakeDb({
      expiredListIds: ["list-1"],
      itemsByList: { "list-1": ["item-1", "item-2"] },
      membersByList: { "list-1": ["owner-uid", "editor-uid"] },
    });

    const result = await purgeExpiredDeletedListsHandler(db as never, 1_000_000);

    expect(result).toEqual({ purgedCount: 1 });
    expect(commit).toHaveBeenCalledOnce();
    // 2 items + 2 members + 2 listRefs + the list doc itself.
    expect(deleted).toHaveLength(7);
    expect(deleted).toContainEqual(expect.objectContaining({ path: "lists/list-1" }));
    expect(deleted).toContainEqual({ path: "users/owner-uid/listRefs/list-1" });
    expect(deleted).toContainEqual({ path: "users/editor-uid/listRefs/list-1" });
  });

  it("purges multiple expired lists independently", async () => {
    const { db, commit } = fakeDb({
      expiredListIds: ["list-1", "list-2"],
      membersByList: { "list-1": ["uid-1"], "list-2": ["uid-2"] },
    });

    const result = await purgeExpiredDeletedListsHandler(db as never, 1_000_000);

    expect(result).toEqual({ purgedCount: 2 });
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
