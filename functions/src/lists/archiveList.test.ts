import { beforeEach, describe, expect, it, vi } from "vitest";

import { archiveListHandler } from "./archiveList";
import * as listStore from "./listStore";

vi.mock("./listStore");

describe("archiveListHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("archives the list", async () => {
    vi.mocked(listStore.archiveListTransaction).mockResolvedValue("ok");

    await expect(archiveListHandler({ listId: "list-1" }, "uid-1")).resolves.toEqual({ ok: true });
    expect(listStore.archiveListTransaction).toHaveBeenCalledWith("uid-1", "list-1");
  });

  it("throws not-found when the list does not exist", async () => {
    vi.mocked(listStore.archiveListTransaction).mockResolvedValue("not-found");

    await expect(archiveListHandler({ listId: "list-1" }, "uid-1")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws permission-denied when the caller is not the owner", async () => {
    vi.mocked(listStore.archiveListTransaction).mockResolvedValue("forbidden");

    await expect(archiveListHandler({ listId: "list-1" }, "uid-1")).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("rejects an empty listId before touching Firestore", async () => {
    await expect(archiveListHandler({ listId: "" }, "uid-1")).rejects.toThrow();
    expect(listStore.archiveListTransaction).not.toHaveBeenCalled();
  });
});
