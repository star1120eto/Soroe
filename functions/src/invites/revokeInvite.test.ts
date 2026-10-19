import { beforeEach, describe, expect, it, vi } from "vitest";

import * as inviteStore from "./inviteStore";
import { revokeInviteHandler } from "./revokeInvite";

vi.mock("./inviteStore");

describe("revokeInviteHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes the invite", async () => {
    vi.mocked(inviteStore.revokeInviteTransaction).mockResolvedValue("ok");

    await expect(revokeInviteHandler({ inviteId: "hash" }, "uid-1", 5)).resolves.toEqual({ ok: true });
    expect(inviteStore.revokeInviteTransaction).toHaveBeenCalledWith("uid-1", "hash", 5);
  });

  it("throws not-found for an unknown invite", async () => {
    vi.mocked(inviteStore.revokeInviteTransaction).mockResolvedValue("not-found");

    await expect(revokeInviteHandler({ inviteId: "hash" }, "uid-1", 5)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws permission-denied when the caller is not the owner", async () => {
    vi.mocked(inviteStore.revokeInviteTransaction).mockResolvedValue("forbidden");

    await expect(revokeInviteHandler({ inviteId: "hash" }, "uid-1", 5)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("rejects an empty invite id before touching Firestore", async () => {
    await expect(revokeInviteHandler({ inviteId: "" }, "uid-1", 5)).rejects.toThrow();
    expect(inviteStore.revokeInviteTransaction).not.toHaveBeenCalled();
  });
});
