import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

import { syncListRefHandler } from "./syncListRef";

const BASE_FIELDS = {
  name: "今週の買い物",
  type: "shopping",
  color: "primary",
  icon: "shopping-cart-simple",
  archivedAt: null,
  deletedAt: null,
  updatedAt: "TIMESTAMP_1",
};

function fakeDb(memberUids: string[]) {
  const membersGet = vi.fn().mockResolvedValue({
    empty: memberUids.length === 0,
    docs: memberUids.map((uid) => ({ id: uid })),
  });
  const update = vi.fn();
  const commit = vi.fn().mockResolvedValue(undefined);

  const listsCollection = {
    doc: vi.fn(() => ({
      collection: vi.fn(() => ({ get: membersGet })),
    })),
  };

  const listRefDocMarker = { marker: "listRef" };
  const usersCollection = {
    doc: vi.fn(() => ({
      collection: vi.fn(() => ({
        doc: vi.fn(() => listRefDocMarker),
      })),
    })),
  };

  const db = {
    collection: vi.fn((name: string) => (name === "lists" ? listsCollection : usersCollection)),
    batch: vi.fn(() => ({ update, commit })),
  };

  return { db, update, commit };
}

describe("syncListRefHandler", () => {
  it("does nothing when no synced field changed", async () => {
    const { db, update, commit } = fakeDb(["owner-uid"]);

    await syncListRefHandler(db as never, "list-1", BASE_FIELDS, { ...BASE_FIELDS });

    expect(update).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("propagates a name change to every member's listRef", async () => {
    const { db, update, commit } = fakeDb(["owner-uid", "editor-uid"]);

    await syncListRefHandler(db as never, "list-1", BASE_FIELDS, {
      ...BASE_FIELDS,
      name: "変更後",
      updatedAt: "TIMESTAMP_2",
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledOnce();
    const [, patch] = update.mock.calls[0];
    expect(patch).toMatchObject({ name: "変更後", updatedAt: "TIMESTAMP_2" });
  });

  it("does nothing when the list has no members", async () => {
    const { db, update, commit } = fakeDb([]);

    await syncListRefHandler(db as never, "list-1", BASE_FIELDS, {
      ...BASE_FIELDS,
      color: "danger",
    });

    expect(update).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("propagates a deletedAt change (LIST-006) to every member's listRef", async () => {
    const { db, update, commit } = fakeDb(["owner-uid"]);

    await syncListRefHandler(db as never, "list-1", BASE_FIELDS, {
      ...BASE_FIELDS,
      archivedAt: "TIMESTAMP_2",
      deletedAt: "TIMESTAMP_2",
      updatedAt: "TIMESTAMP_2",
    });

    expect(update).toHaveBeenCalledOnce();
    const [, patch] = update.mock.calls[0];
    expect(patch).toMatchObject({ deletedAt: "TIMESTAMP_2" });
  });

  it("does nothing when archivedAt is equal (same Timestamp value, different object instances)", async () => {
    const { db, update, commit } = fakeDb(["owner-uid"]);
    const ts = Timestamp.fromMillis(1000);
    const tsDifferentInstance = Timestamp.fromMillis(1000);

    await syncListRefHandler(db as never, "list-1", {
      ...BASE_FIELDS,
      archivedAt: ts,
    }, {
      ...BASE_FIELDS,
      archivedAt: tsDifferentInstance,
    });

    expect(update).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});
