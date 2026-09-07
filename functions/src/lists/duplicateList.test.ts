import { beforeEach, describe, expect, it, vi } from "vitest";

import { duplicateListHandler } from "./duplicateList";
import * as entitlements from "./entitlements";
import * as listStore from "./listStore";

vi.mock("./entitlements");
vi.mock("./listStore");

const INPUT = { listId: "list-1", requestId: "req-1" };

describe("duplicateListHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entitlements.getPlan).mockResolvedValue("free");
  });

  it("returns the new list's id", async () => {
    vi.mocked(listStore.duplicateListTransaction).mockResolvedValue({ status: "ok", listId: "list-2" });

    await expect(duplicateListHandler(INPUT, "uid-1")).resolves.toEqual({ listId: "list-2" });
    expect(listStore.duplicateListTransaction).toHaveBeenCalledWith("uid-1", "req-1", "list-1", "free");
  });

  it("throws not-found when the source list is missing or the caller isn't a member", async () => {
    vi.mocked(listStore.duplicateListTransaction).mockResolvedValue({ status: "not-found" });

    await expect(duplicateListHandler(INPUT, "uid-1")).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws resource-exhausted when the free limit is reached", async () => {
    vi.mocked(listStore.duplicateListTransaction).mockResolvedValue({ status: "limit-reached" });

    await expect(duplicateListHandler(INPUT, "uid-1")).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});
