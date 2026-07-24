import { describe, expect, it } from "vitest";

import { userProfileSchema } from "./userProfile";

describe("userProfileSchema", () => {
  it("accepts a valid profile", () => {
    expect(() =>
      userProfileSchema.parse({
        uid: "uid-1",
        displayName: "たろう",
        language: "ja",
        createdAt: Date.now(),
      })
    ).not.toThrow();
  });

  it.each([
    { uid: "", displayName: "たろう", language: "ja", createdAt: 1 },
    { uid: "uid-1", displayName: "", language: "ja", createdAt: 1 },
    { uid: "uid-1", displayName: "a".repeat(31), language: "ja", createdAt: 1 },
    { uid: "uid-1", displayName: "たろう", language: "fr", createdAt: 1 },
    { uid: "uid-1", displayName: "たろう", language: "ja", createdAt: -1 },
  ])("rejects an invalid profile %#", (input) => {
    expect(() => userProfileSchema.parse(input)).toThrow();
  });
});
