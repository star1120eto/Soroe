import { describe, expect, it } from "vitest";

import { OTP_LENGTH } from "./constants";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "./otpCode";

describe("generateOtpCode", () => {
  it("generates a 6 digit numeric code", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      expect(code).toHaveLength(OTP_LENGTH);
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashOtpCode / verifyOtpCode", () => {
  it("verifies a code against its own hash", () => {
    const hash = hashOtpCode("123456", "secret");
    expect(verifyOtpCode("123456", "secret", hash)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const hash = hashOtpCode("123456", "secret");
    expect(verifyOtpCode("000000", "secret", hash)).toBe(false);
  });

  it("rejects the right code hashed with a different secret", () => {
    const hash = hashOtpCode("123456", "secret-a");
    expect(verifyOtpCode("123456", "secret-b", hash)).toBe(false);
  });

  it("never stores the plaintext code in the hash", () => {
    const hash = hashOtpCode("123456", "secret");
    expect(hash).not.toContain("123456");
  });
});
