import { describe, expect, it } from "vitest";

import {
  requestEmailOtpInputSchema,
  verifyEmailOtpInputSchema,
} from "./emailOtp";

describe("requestEmailOtpInputSchema", () => {
  it("trims and lowercases the email", () => {
    const result = requestEmailOtpInputSchema.parse({
      email: "  Foo@Example.com ",
      deviceId: "device-1",
    });
    expect(result.email).toBe("foo@example.com");
  });

  it("rejects an invalid email", () => {
    expect(() =>
      requestEmailOtpInputSchema.parse({ email: "not-an-email", deviceId: "device-1" })
    ).toThrow();
  });
});

describe("verifyEmailOtpInputSchema", () => {
  it("accepts a 6 digit code", () => {
    expect(() =>
      verifyEmailOtpInputSchema.parse({ email: "foo@example.com", code: "123456" })
    ).not.toThrow();
  });

  it.each(["12345", "1234567", "abcdef"])("rejects an invalid code %s", (code) => {
    expect(() => verifyEmailOtpInputSchema.parse({ email: "foo@example.com", code })).toThrow();
  });
});
