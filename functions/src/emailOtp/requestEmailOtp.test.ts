import { beforeEach, describe, expect, it, vi } from "vitest";

import * as otpStore from "./otpStore";
import * as rateLimitStore from "./rateLimitStore";
import { requestEmailOtpHandler } from "./requestEmailOtp";

vi.mock("./otpStore");
vi.mock("./rateLimitStore");

describe("requestEmailOtpHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimitStore.consumeRateLimit).mockResolvedValue(true);
    vi.mocked(otpStore.getOtpRecord).mockResolvedValue(null);
    vi.mocked(otpStore.saveOtpRecord).mockResolvedValue(undefined);
  });

  it("sends an OTP and returns the generic response", async () => {
    const sendOtpEmail = vi.fn().mockResolvedValue(undefined);

    const result = await requestEmailOtpHandler(
      { email: "Foo@Example.com", deviceId: "device-1" },
      "1.2.3.4",
      { sendOtpEmail },
      "secret"
    );

    expect(result).toEqual({ status: "sent" });
    expect(sendOtpEmail).toHaveBeenCalledWith("foo@example.com", expect.stringMatching(/^\d{6}$/));
    expect(otpStore.saveOtpRecord).toHaveBeenCalledOnce();
  });

  it("throws and does not send an email when a rate limit is exceeded", async () => {
    vi.mocked(rateLimitStore.consumeRateLimit).mockResolvedValueOnce(false);
    const sendOtpEmail = vi.fn();

    await expect(
      requestEmailOtpHandler(
        { email: "foo@example.com", deviceId: "device-1" },
        "1.2.3.4",
        { sendOtpEmail },
        "secret"
      )
    ).rejects.toThrow();

    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it("throws and does not send an email within the resend cooldown", async () => {
    vi.mocked(otpStore.getOtpRecord).mockResolvedValue({
      codeHash: "existing",
      createdAtMs: 1_000,
      expiresAtMs: 999_999_999,
      attempts: 0,
    });
    const sendOtpEmail = vi.fn();

    await expect(
      requestEmailOtpHandler(
        { email: "foo@example.com", deviceId: "device-1" },
        "1.2.3.4",
        { sendOtpEmail },
        "secret",
        1_000 + 1_000
      )
    ).rejects.toThrow();

    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it("allows a resend once the cooldown has elapsed", async () => {
    vi.mocked(otpStore.getOtpRecord).mockResolvedValue({
      codeHash: "existing",
      createdAtMs: 1_000,
      expiresAtMs: 999_999_999,
      attempts: 0,
    });
    const sendOtpEmail = vi.fn().mockResolvedValue(undefined);

    const result = await requestEmailOtpHandler(
      { email: "foo@example.com", deviceId: "device-1" },
      "1.2.3.4",
      { sendOtpEmail },
      "secret",
      1_000 + 60_000
    );

    expect(result).toEqual({ status: "sent" });
    expect(sendOtpEmail).toHaveBeenCalledOnce();
  });
});
