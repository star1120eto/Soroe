import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteListHandler } from "./deleteList";
import * as listStore from "./listStore";

vi.mock("./listStore");

describe("deleteListHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the list", async () => {
    vi.mocked(listStore.deleteListTransaction).mockResolvedValue("ok");

    await expect(deleteListHandler({ listId: "list-1" }, "uid-1")).resolves.toEqual({ ok: true });
    expect(listStore.deleteListTransaction).toHaveBeenCalledWith("uid-1", "list-1");
  });

  it("throws not-found when the list does not exist", async () => {
    vi.mocked(listStore.deleteListTransaction).mockResolvedValue("not-found");

    await expect(deleteListHandler({ listId: "list-1" }, "uid-1")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws permission-denied when the caller is not the owner", async () => {
    vi.mocked(listStore.deleteListTransaction).mockResolvedValue("forbidden");

    await expect(deleteListHandler({ listId: "list-1" }, "uid-1")).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});
