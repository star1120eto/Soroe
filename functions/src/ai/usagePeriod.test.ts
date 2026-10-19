import { describe, expect, it } from "vitest";

import { jstMonthKey, nextJstMonthStartMs } from "./usagePeriod";

describe("jstMonthKey", () => {
  it("uses the Japan Standard Time calendar month", () => {
    expect(jstMonthKey(Date.UTC(2026, 9, 15, 3, 0, 0))).toBe("202610");
  });

  it("changes month at 00:00 JST, which is 15:00 UTC the day before", () => {
    expect(jstMonthKey(Date.UTC(2026, 9, 31, 14, 59, 59))).toBe("202610");
    expect(jstMonthKey(Date.UTC(2026, 9, 31, 15, 0, 0))).toBe("202611");
  });

  it("rolls the year over in January", () => {
    expect(jstMonthKey(Date.UTC(2026, 11, 31, 15, 0, 0))).toBe("202701");
  });
});

describe("nextJstMonthStartMs", () => {
  it("is the first moment of the next month in JST", () => {
    expect(nextJstMonthStartMs(Date.UTC(2026, 9, 15, 3, 0, 0))).toBe(Date.UTC(2026, 9, 31, 15, 0, 0));
  });

  it("moves on to the following month exactly at the boundary", () => {
    expect(nextJstMonthStartMs(Date.UTC(2026, 9, 31, 15, 0, 0))).toBe(Date.UTC(2026, 10, 30, 15, 0, 0));
  });
});
