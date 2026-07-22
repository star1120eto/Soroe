import { describe, expect, it } from "vitest";

import { isExpired, isWithinCooldown } from "./otpTiming";

describe("isWithinCooldown", () => {
  it("is true immediately after creation", () => {
    expect(isWithinCooldown(1000, 1000, 60)).toBe(true);
  });

  it("is true just before the cooldown elapses", () => {
    expect(isWithinCooldown(1000, 1000 + 59_000, 60)).toBe(true);
  });

  it("is false once the cooldown has elapsed", () => {
    expect(isWithinCooldown(1000, 1000 + 60_000, 60)).toBe(false);
  });
});

describe("isExpired", () => {
  it("is false before expiry", () => {
    expect(isExpired(10_000, 9_999)).toBe(false);
  });

  it("is true at or after expiry", () => {
    expect(isExpired(10_000, 10_000)).toBe(true);
    expect(isExpired(10_000, 10_001)).toBe(true);
  });
});
