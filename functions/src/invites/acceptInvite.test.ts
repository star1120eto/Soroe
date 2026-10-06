import { beforeEach, describe, expect, it, vi } from "vitest";

import * as entitlements from "../lists/entitlements";
import * as profile from "../users/profile";
import { acceptInviteHandler } from "./acceptInvite";
import * as inviteRateLimit from "./inviteRateLimit";
import * as inviteStore from "./inviteStore";
import { hashInviteToken } from "./token";

vi.mock("./inviteStore");
vi.mock("./inviteRateLimit");
vi.mock("../lists/entitlements");
vi.mock("../users/profile");

const TOKEN = "a".repeat(64);
const INPUT = { token: TOKEN, requestId: "req-1" };

describe("acceptInviteHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entitlements.getPlan).mockResolvedValue("free");
    vi.mocked(profile.getDisplayName).mockResolvedValue("はなこ");
  });

  it("passes the hashed token, plan and display name to the transaction", async () => {
    vi.mocked(inviteStore.acceptInviteTransaction).mockResolvedValue({ status: "joined", listId: "list-1" });

    const result = await acceptInviteHandler(INPUT, "uid-2", 9);

    expect(result).toEqual({ status: "joined", listId: "list-1" });
    expect(inviteStore.acceptInviteTransaction).toHaveBeenCalledWith(
      "uid-2",
      "はなこ",
      hashInviteToken(TOKEN),
      "req-1",
      "free",
      9
    );
  });

  it("uses the caller's Premium plan for the limit check", async () => {
    vi.mocked(entitlements.getPlan).mockResolvedValue("premium");
    vi.mocked(inviteStore.acceptInviteTransaction).mockResolvedValue({ status: "joined", listId: "list-1" });

    await acceptInviteHandler(INPUT, "uid-2", 9);

    expect(inviteStore.acceptInviteTransaction).toHaveBeenCalledWith(
      "uid-2",
      "はなこ",
      expect.any(String),
      "req-1",
      "premium",
      9
    );
  });

  it.each([
    { status: "limit-reached" },
    { status: "own-invite" },
    { status: "expired" },
    { status: "revoked" },
    { status: "list-deleted" },
    { status: "list-archived" },
    { status: "not-found" },
    { status: "already-member", listId: "list-1" },
  ] as const)("returns %j as data so the app can explain it", async (response) => {
    vi.mocked(inviteStore.acceptInviteTransaction).mockResolvedValue(response);

    await expect(acceptInviteHandler(INPUT, "uid-2", 9)).resolves.toEqual(response);
  });

  it("rate-limits per user before touching Firestore", async () => {
    vi.mocked(inviteRateLimit.enforceInviteRateLimit).mockRejectedValue(new Error("rate limited"));

    await expect(acceptInviteHandler(INPUT, "uid-2", 9)).rejects.toThrow("rate limited");
    expect(inviteRateLimit.enforceInviteRateLimit).toHaveBeenCalledWith("accept", "uid-2", 9);
    expect(inviteStore.acceptInviteTransaction).not.toHaveBeenCalled();
  });

  it("rejects a malformed request before touching Firestore", async () => {
    await expect(acceptInviteHandler({ token: "x", requestId: "req-1" }, "uid-2", 9)).rejects.toThrow();
    expect(inviteStore.acceptInviteTransaction).not.toHaveBeenCalled();
  });
});
