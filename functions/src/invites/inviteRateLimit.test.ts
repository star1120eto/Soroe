import { beforeEach, describe, expect, it, vi } from "vitest";

import * as rateLimitStore from "../emailOtp/rateLimitStore";
import { INVITE_RATE_LIMITS, enforceInviteRateLimit } from "./inviteRateLimit";

vi.mock("../emailOtp/rateLimitStore");

describe("enforceInviteRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes when the limiter allows the request", async () => {
    vi.mocked(rateLimitStore.consumeRateLimit).mockResolvedValue(true);

    await expect(enforceInviteRateLimit("accept", "uid-1", 1000)).resolves.toBeUndefined();
  });

  it("throws resource-exhausted when the limiter blocks the request", async () => {
    vi.mocked(rateLimitStore.consumeRateLimit).mockResolvedValue(false);

    await expect(enforceInviteRateLimit("accept", "uid-1", 1000)).rejects.toMatchObject({
      code: "resource-exhausted",
    });
  });

  it("keys the counter per action and subject in the invite-specific collection", async () => {
    vi.mocked(rateLimitStore.consumeRateLimit).mockResolvedValue(true);

    await enforceInviteRateLimit("preview", "203.0.113.9", 1000);

    expect(rateLimitStore.consumeRateLimit).toHaveBeenCalledWith(
      "preview:203.0.113.9",
      1000,
      INVITE_RATE_LIMITS.preview.windowMs,
      INVITE_RATE_LIMITS.preview.max,
      "inviteRateLimits"
    );
  });
});
