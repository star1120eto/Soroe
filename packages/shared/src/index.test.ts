import { describe, expect, it } from "vitest";

import { SOROE_SHARED_PACKAGE_VERSION } from "./index";

describe("SOROE_SHARED_PACKAGE_VERSION", () => {
  it("is defined", () => {
    expect(SOROE_SHARED_PACKAGE_VERSION).toBe("0.0.1");
  });
});
