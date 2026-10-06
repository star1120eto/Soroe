import { beforeEach, describe, expect, it, vi } from "vitest";

import { getInvitePreviewHandler } from "./getInvitePreview";
import * as inviteRateLimit from "./inviteRateLimit";
import * as inviteStore from "./inviteStore";
import { hashInviteToken } from "./token";

vi.mock("./inviteStore");
vi.mock("./inviteRateLimit");

const TOKEN = "a".repeat(64);

describe("getInvitePreviewHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks the invite up by token hash and returns the preview", async () => {
    const preview = {
      status: "valid" as const,
      listName: "今週の買い物",
      inviterName: "たろう",
      memberCount: 2,
      expiresAt: 10,
    };
    vi.mocked(inviteStore.getInvitePreview).mockResolvedValue(preview);

    await expect(getInvitePreviewHandler({ token: TOKEN }, "203.0.113.9", 7)).resolves.toEqual(preview);
    expect(inviteStore.getInvitePreview).toHaveBeenCalledWith(hashInviteToken(TOKEN), 7);
  });

  it("returns an unavailable reason as data, not an error", async () => {
    vi.mocked(inviteStore.getInvitePreview).mockResolvedValue({ status: "expired" });

    await expect(getInvitePreviewHandler({ token: TOKEN }, "203.0.113.9", 7)).resolves.toEqual({
      status: "expired",
    });
  });

  it("rate-limits per IP before touching Firestore (the preview needs no sign-in)", async () => {
    vi.mocked(inviteRateLimit.enforceInviteRateLimit).mockRejectedValue(new Error("rate limited"));

    await expect(getInvitePreviewHandler({ token: TOKEN }, "203.0.113.9", 7)).rejects.toThrow("rate limited");
    expect(inviteRateLimit.enforceInviteRateLimit).toHaveBeenCalledWith("preview", "203.0.113.9", 7);
    expect(inviteStore.getInvitePreview).not.toHaveBeenCalled();
  });

  it("rejects a malformed token before touching Firestore", async () => {
    await expect(getInvitePreviewHandler({ token: "nope" }, "203.0.113.9", 7)).rejects.toThrow();
    expect(inviteStore.getInvitePreview).not.toHaveBeenCalled();
  });
});
