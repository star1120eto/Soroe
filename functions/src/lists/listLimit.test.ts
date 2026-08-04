import { describe, expect, it } from "vitest";

import { FREE_ACTIVE_LIST_LIMIT } from "./constants";
import { isUnderActiveListLimit } from "./listLimit";

describe("isUnderActiveListLimit", () => {
  it.each([0, 1, FREE_ACTIVE_LIST_LIMIT - 1])(
    "allows a free user with %i active lists",
    (count) => {
      expect(isUnderActiveListLimit(count, "free")).toBe(true);
    }
  );

  it.each([FREE_ACTIVE_LIST_LIMIT, FREE_ACTIVE_LIST_LIMIT + 1])(
    "rejects a free user with %i active lists",
    (count) => {
      expect(isUnderActiveListLimit(count, "free")).toBe(false);
    }
  );

  it("always allows a premium user", () => {
    expect(isUnderActiveListLimit(999, "premium")).toBe(true);
  });
});
