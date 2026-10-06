import { afterEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_BATCH_CHUNK_SIZE } from "./constants";
import { purgeExpiredDeletedListsHandler } from "./purgeExpiredDeletedLists";

type FakeDbConfig = {
  expiredListIds: string[];
  itemsByList?: Record<string, string[]>;
  membersByList?: Record<string, string[]>;
  // invites/{tokenHash}のID(listIdで引き当てられる招待)。
  invitesByList?: Record<string, string[]>;
  // このリストのbatch.commit()だけを失敗させ、他のリストが引き続き
  // 処理されることを確認するためのテスト用フック。
  failingListIds?: string[];
};

function fakeDb({
  expiredListIds,
  itemsByList = {},
  membersByList = {},
  invitesByList = {},
  failingListIds = [],
}: FakeDbConfig) {
  const deleted: unknown[] = [];
  const commitCallSizes: number[] = [];
  let pendingForCurrentBatch: { path: string }[] = [];
  const batchDelete = vi.fn((ref: { path: string }) => pendingForCurrentBatch.push(ref));
  const commit = vi.fn(() => {
    commitCallSizes.push(pendingForCurrentBatch.length);
    const failing = failingListIds.find((id) =>
      pendingForCurrentBatch.some((ref) => ref.path === `lists/${id}`)
    );
    if (failing) {
      return Promise.reject(new Error(`simulated failure for ${failing}`));
    }
    deleted.push(...pendingForCurrentBatch);
    return Promise.resolve(undefined);
  });
  const batch = vi.fn(() => {
    pendingForCurrentBatch = [];
    return { delete: batchDelete, commit };
  });

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

  const invitesCollection = {
    where: vi.fn((field: string, op: string, listId: string) => {
      if (field !== "listId" || op !== "==") {
        throw new Error(`unexpected invites query ${field} ${op}`);
      }
      return {
        get: () =>
          Promise.resolve({
            docs: (invitesByList[listId] ?? []).map((inviteId) => ({ ref: { path: `invites/${inviteId}` } })),
          }),
      };
    }),
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
    collection: vi.fn((name: string) => {
      if (name === "lists") return listsCollection;
      if (name === "invites") return invitesCollection;
      return usersCollection;
    }),
    batch,
  };

  return { db, deleted, commit, commitCallSizes, listsWhere: listsCollection.where };
}

describe("purgeExpiredDeletedListsHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("also deletes the list's invites so no inviter ids or dead links are left behind", async () => {
    const { db, deleted } = fakeDb({
      expiredListIds: ["list-1"],
      membersByList: { "list-1": ["owner-uid"] },
      invitesByList: { "list-1": ["hash-a", "hash-b"] },
    });

    await purgeExpiredDeletedListsHandler(db as never, 1_000_000);

    expect(deleted).toContainEqual({ path: "invites/hash-a" });
    expect(deleted).toContainEqual({ path: "invites/hash-b" });
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

  it("keeps purging the remaining lists when one list's purge fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, deleted } = fakeDb({
      expiredListIds: ["list-1", "list-2"],
      membersByList: { "list-1": ["uid-1"], "list-2": ["uid-2"] },
      failingListIds: ["list-1"],
    });

    const result = await purgeExpiredDeletedListsHandler(db as never, 1_000_000);

    // list-1の失敗はカウントされず、list-2だけ物理削除が完了する。
    expect(result).toEqual({ purgedCount: 1 });
    expect(deleted).toContainEqual(expect.objectContaining({ path: "lists/list-2" }));
    expect(deleted).not.toContainEqual(expect.objectContaining({ path: "lists/list-1" }));
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
  });

  it("splits a large list's deletes across multiple batches instead of one 500+ write commit", async () => {
    const manyItemIds = Array.from({ length: FIRESTORE_BATCH_CHUNK_SIZE + 1 }, (_, i) => `item-${i}`);
    const { db, deleted, commitCallSizes } = fakeDb({
      expiredListIds: ["list-1"],
      itemsByList: { "list-1": manyItemIds },
    });

    const result = await purgeExpiredDeletedListsHandler(db as never, 1_000_000);

    expect(result).toEqual({ purgedCount: 1 });
    // FIRESTORE_BATCH_CHUNK_SIZE件のitems + 残り1件のitem + リスト本体1件。
    expect(commitCallSizes).toEqual([FIRESTORE_BATCH_CHUNK_SIZE, 2]);
    expect(deleted).toHaveLength(manyItemIds.length + 1);
    expect(deleted).toContainEqual(expect.objectContaining({ path: "lists/list-1" }));
  });
});
