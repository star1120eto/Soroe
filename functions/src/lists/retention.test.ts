import { describe, expect, it } from "vitest";

import { isWithinRestoreWindow, retentionCutoffMillis } from "./retention";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("isWithinRestoreWindow", () => {
  it("allows restoring right after deletion", () => {
    expect(isWithinRestoreWindow(1000, 1000)).toBe(true);
  });

  it("allows restoring just under 30 days later", () => {
    const deletedAt = 0;
    const now = 30 * DAY_MS - 1;
    expect(isWithinRestoreWindow(deletedAt, now)).toBe(true);
  });

  it("rejects restoring at or after 30 days", () => {
    const deletedAt = 0;
    expect(isWithinRestoreWindow(deletedAt, 30 * DAY_MS)).toBe(false);
    expect(isWithinRestoreWindow(deletedAt, 31 * DAY_MS)).toBe(false);
  });
});

describe("retentionCutoffMillis", () => {
  it("returns the timestamp 30 days before now", () => {
    expect(retentionCutoffMillis(30 * DAY_MS)).toBe(0);
  });
});
