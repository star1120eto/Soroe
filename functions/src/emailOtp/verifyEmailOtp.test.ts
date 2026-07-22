import { getAuth } from "firebase-admin/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OTP_MAX_ATTEMPTS } from "./constants";
import { hashOtpCode } from "./otpCode";
import * as otpStore from "./otpStore";
import { verifyEmailOtpHandler } from "./verifyEmailOtp";

vi.mock("./otpStore");
vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(),
}));

const HASH_SECRET = "secret";
const CODE = "123456";

const mockAuth = {
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  createCustomToken: vi.fn(),
};

describe("verifyEmailOtpHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);
    mockAuth.createCustomToken.mockResolvedValue("custom-token");
    vi.mocked(otpStore.deleteOtpRecord).mockResolvedValue(undefined);
    vi.mocked(otpStore.incrementOtpAttempts).mockResolvedValue(undefined);
  });

  it("returns a custom token for an existing user on a correct code", async () => {
    vi.mocked(otpStore.getOtpRecord).mockResolvedValue({
      codeHash: hashOtpCode(CODE, HASH_SECRET),
      createdAtMs: 0,
      expiresAtMs: 999_999_999,
      attempts: 0,
    });
    mockAuth.getUserByEmail.mockResolvedValue({ uid: "existing-uid" });

    const result = await verifyEmailOtpHandler({ email: "foo@example.com", code: CODE }, HASH_SECRET, 1000);

    expect(result).toEqual({ customToken: "custom-token" });
    expect(mockAuth.createUser).not.toHaveBeenCalled();
    expect(mockAuth.createCustomToken).toHaveBeenCalledWith("existing-uid");
    expect(otpStore.deleteOtpRecord).toHaveBeenCalledWith("foo@example.com");
  });

  it("creates a new auth user when none exists yet", async () => {
    vi.mocked(otpStore.getOtpRecord).mockResolvedValue({
      codeHash: hashOtpCode(CODE, HASH_SECRET),
      createdAtMs: 0,
      expiresAtMs: 999_999_999,
      attempts: 0,
    });
    mockAuth.getUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });
    mockAuth.createUser.mockResolvedValue({ uid: "new-uid" });

    const result = await verifyEmailOtpHandler({ email: "foo@example.com", code: CODE }, HASH_SECRET, 1000);

    expect(result).toEqual({ customToken: "custom-token" });
    expect(mockAuth.createUser).toHaveBeenCalledWith({ email: "foo@example.com", emailVerified: true });
  });

  it("rejects when no OTP record exists", async () => {
    vi.mocked(otpStore.getOtpRecord).mockResolvedValue(null);

    await expect(
      verifyEmailOtpHandler({ email: "foo@example.com", code: CODE }, HASH_SECRET, 1000)
    ).rejects.toThrow();
    expect(mockAuth.createCustomToken).not.toHaveBeenCalled();
  });

  it("rejects and deletes the record once expired", async () => {
    vi.mocked(otpStore.getOtpRecord).mockResolvedValue({
      codeHash: hashOtpCode(CODE, HASH_SECRET),
      createdAtMs: 0,
      expiresAtMs: 1000,
      attempts: 0,
    });

    await expect(
      verifyEmailOtpHandler({ email: "foo@example.com", code: CODE }, HASH_SECRET, 1000)
    ).rejects.toThrow();
    expect(otpStore.deleteOtpRecord).toHaveBeenCalledWith("foo@example.com");
  });

  it("rejects and deletes the record once max attempts are reached", async () => {
    vi.mocked(otpStore.getOtpRecord).mockResolvedValue({
      codeHash: hashOtpCode(CODE, HASH_SECRET),
      createdAtMs: 0,
      expiresAtMs: 999_999_999,
      attempts: OTP_MAX_ATTEMPTS,
    });

    await expect(
      verifyEmailOtpHandler({ email: "foo@example.com", code: CODE }, HASH_SECRET, 1000)
    ).rejects.toThrow();
    expect(otpStore.deleteOtpRecord).toHaveBeenCalledWith("foo@example.com");
  });

  it("increments attempts and rejects on a wrong code", async () => {
    vi.mocked(otpStore.getOtpRecord).mockResolvedValue({
      codeHash: hashOtpCode(CODE, HASH_SECRET),
      createdAtMs: 0,
      expiresAtMs: 999_999_999,
      attempts: 0,
    });

    await expect(
      verifyEmailOtpHandler({ email: "foo@example.com", code: "000000" }, HASH_SECRET, 1000)
    ).rejects.toThrow();
    expect(otpStore.incrementOtpAttempts).toHaveBeenCalledWith("foo@example.com");
    expect(otpStore.deleteOtpRecord).not.toHaveBeenCalled();
  });
});
