import { beforeEach, describe, expect, it, vi } from "vitest";

import { restoreListHandler } from "./restoreList";
import * as entitlements from "./entitlements";
import * as listStore from "./listStore";

vi.mock("./entitlements");
vi.mock("./listStore");

const INPUT = { listId: "list-1", requestId: "req-1" };

describe("restoreListHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entitlements.getPlan).mockResolvedValue("free");
  });

  it("restores the list", async () => {
    vi.mocked(listStore.restoreListTransaction).mockResolvedValue({ status: "ok" });

    await expect(restoreListHandler(INPUT, "uid-1")).resolves.toEqual({ ok: true });
    expect(listStore.restoreListTransaction).toHaveBeenCalledWith("uid-1", "req-1", "list-1", "free");
  });

  it("throws failed-precondition when the 30-day window has passed", async () => {
    vi.mocked(listStore.restoreListTransaction).mockResolvedValue({ status: "expired" });

    await expect(restoreListHandler(INPUT, "uid-1")).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws resource-exhausted when the free limit is reached", async () => {
    vi.mocked(listStore.restoreListTransaction).mockResolvedValue({ status: "limit-reached" });

    await expect(restoreListHandler(INPUT, "uid-1")).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("throws permission-denied when the caller is not the owner", async () => {
    vi.mocked(listStore.restoreListTransaction).mockResolvedValue({ status: "forbidden" });

    await expect(restoreListHandler(INPUT, "uid-1")).rejects.toMatchObject({ code: "permission-denied" });
  });
});
