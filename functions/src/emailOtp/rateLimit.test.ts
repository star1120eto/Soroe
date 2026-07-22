import { describe, expect, it } from "vitest";

import { checkRateLimit } from "./rateLimit";

const WINDOW_MS = 60_000;
const MAX = 3;

describe("checkRateLimit", () => {
  it("allows the first request and starts a new window", () => {
    const result = checkRateLimit(undefined, 1000, WINDOW_MS, MAX);
    expect(result.allowed).toBe(true);
    expect(result.nextWindow).toEqual({ windowStart: 1000, count: 1 });
  });

  it("allows requests under the limit within the same window", () => {
    const result = checkRateLimit({ windowStart: 1000, count: 1 }, 2000, WINDOW_MS, MAX);
    expect(result.allowed).toBe(true);
    expect(result.nextWindow).toEqual({ windowStart: 1000, count: 2 });
  });

  it("denies once the limit is reached within the window", () => {
    const result = checkRateLimit({ windowStart: 1000, count: MAX }, 2000, WINDOW_MS, MAX);
    expect(result.allowed).toBe(false);
    expect(result.nextWindow).toEqual({ windowStart: 1000, count: MAX });
  });

  it("resets the window once it has expired", () => {
    const result = checkRateLimit(
      { windowStart: 1000, count: MAX },
      1000 + WINDOW_MS,
      WINDOW_MS,
      MAX
    );
    expect(result.allowed).toBe(true);
    expect(result.nextWindow).toEqual({ windowStart: 1000 + WINDOW_MS, count: 1 });
  });
});
