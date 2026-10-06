import { beforeEach, describe, expect, it, vi } from "vitest";

import * as memberManagement from "./memberManagement";
import { transferOwnershipHandler } from "./transferOwnership";

vi.mock("./memberManagement");

const INPUT = { listId: "list-1", newOwnerUid: "uid-2" };

describe("transferOwnershipHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transfers ownership", async () => {
    vi.mocked(memberManagement.transferOwnershipTransaction).mockResolvedValue("ok");

    await expect(transferOwnershipHandler(INPUT, "uid-1")).resolves.toEqual({ ok: true });
    expect(memberManagement.transferOwnershipTransaction).toHaveBeenCalledWith("uid-1", "list-1", "uid-2");
  });

  it.each([
    ["not-found", "not-found"],
    ["forbidden", "permission-denied"],
    ["already-deleted", "failed-precondition"],
    ["invalid-target", "invalid-argument"],
    ["target-not-member", "failed-precondition"],
  ] as const)("maps %s to %s", async (result, code) => {
    vi.mocked(memberManagement.transferOwnershipTransaction).mockResolvedValue(result);

    await expect(transferOwnershipHandler(INPUT, "uid-1")).rejects.toMatchObject({ code });
  });

  it("rejects an empty new owner uid before touching Firestore", async () => {
    await expect(transferOwnershipHandler({ listId: "list-1", newOwnerUid: "" }, "uid-1")).rejects.toThrow();
    expect(memberManagement.transferOwnershipTransaction).not.toHaveBeenCalled();
  });
});
