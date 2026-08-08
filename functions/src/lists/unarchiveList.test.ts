import { beforeEach, describe, expect, it, vi } from "vitest";

import { unarchiveListHandler } from "./unarchiveList";
import * as entitlements from "./entitlements";
import * as listStore from "./listStore";

vi.mock("./entitlements");
vi.mock("./listStore");

const INPUT = { listId: "list-1", requestId: "req-1" };

describe("unarchiveListHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entitlements.getPlan).mockResolvedValue("free");
  });

  it("unarchives the list", async () => {
    vi.mocked(listStore.unarchiveListTransaction).mockResolvedValue({ status: "ok" });

    await expect(unarchiveListHandler(INPUT, "uid-1")).resolves.toEqual({ ok: true });
    expect(listStore.unarchiveListTransaction).toHaveBeenCalledWith("uid-1", "req-1", "list-1", "free");
  });

  it("throws not-found when the list does not exist", async () => {
    vi.mocked(listStore.unarchiveListTransaction).mockResolvedValue({ status: "not-found" });

    await expect(unarchiveListHandler(INPUT, "uid-1")).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied when the caller is not the owner", async () => {
    vi.mocked(listStore.unarchiveListTransaction).mockResolvedValue({ status: "forbidden" });

    await expect(unarchiveListHandler(INPUT, "uid-1")).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws resource-exhausted when the free limit is reached", async () => {
    vi.mocked(listStore.unarchiveListTransaction).mockResolvedValue({ status: "limit-reached" });

    await expect(unarchiveListHandler(INPUT, "uid-1")).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});
