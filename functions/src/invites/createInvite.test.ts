import { beforeEach, describe, expect, it, vi } from "vitest";

import { createInviteHandler } from "./createInvite";
import * as inviteRateLimit from "./inviteRateLimit";
import * as inviteStore from "./inviteStore";
import { hashInviteToken } from "./token";

vi.mock("./inviteStore");
vi.mock("./inviteRateLimit");

const TOKEN = "a".repeat(64);
const NOW = 1_000_000;

describe("createInviteHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashes the token before it reaches the store and returns the invite id and expiry", async () => {
    vi.mocked(inviteStore.createInviteTransaction).mockResolvedValue({
      status: "created",
      inviteId: "hash",
      expiresAtMs: 123,
    });

    const result = await createInviteHandler({ listId: "list-1", token: TOKEN }, "uid-1", NOW);

    expect(result).toEqual({ inviteId: "hash", expiresAt: 123 });
    expect(inviteStore.createInviteTransaction).toHaveBeenCalledWith(
      "uid-1",
      "list-1",
      hashInviteToken(TOKEN),
      NOW
    );
    // 平文トークンはstoreへ渡さない。
    expect(JSON.stringify(vi.mocked(inviteStore.createInviteTransaction).mock.calls)).not.toContain(TOKEN);
  });

  it("returns the same shape for an idempotent replay", async () => {
    vi.mocked(inviteStore.createInviteTransaction).mockResolvedValue({
      status: "reused",
      inviteId: "hash",
      expiresAtMs: 123,
    });

    await expect(createInviteHandler({ listId: "list-1", token: TOKEN }, "uid-1", NOW)).resolves.toEqual({
      inviteId: "hash",
      expiresAt: 123,
    });
  });

  it.each([
    ["not-found", "not-found"],
    ["forbidden", "permission-denied"],
    ["list-unavailable", "failed-precondition"],
    ["token-conflict", "already-exists"],
    ["too-many-active", "failed-precondition"],
  ] as const)("maps %s to the %s error code", async (status, code) => {
    vi.mocked(inviteStore.createInviteTransaction).mockResolvedValue({ status });

    await expect(createInviteHandler({ listId: "list-1", token: TOKEN }, "uid-1", NOW)).rejects.toMatchObject({
      code,
    });
  });

  it("rate-limits per user before touching Firestore", async () => {
    vi.mocked(inviteRateLimit.enforceInviteRateLimit).mockRejectedValue(new Error("rate limited"));

    await expect(createInviteHandler({ listId: "list-1", token: TOKEN }, "uid-1", NOW)).rejects.toThrow(
      "rate limited"
    );
    expect(inviteRateLimit.enforceInviteRateLimit).toHaveBeenCalledWith("create", "uid-1", NOW);
    expect(inviteStore.createInviteTransaction).not.toHaveBeenCalled();
  });

  it("rejects a malformed token before touching Firestore", async () => {
    await expect(createInviteHandler({ listId: "list-1", token: "short" }, "uid-1", NOW)).rejects.toThrow();
    expect(inviteStore.createInviteTransaction).not.toHaveBeenCalled();
  });
});
