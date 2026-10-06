import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get }) }) }),
}));

import { getDisplayName } from "./profile";

describe("getDisplayName", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("returns the profile's display name", async () => {
    get.mockResolvedValue({ data: () => ({ displayName: "はなこ" }) });
    await expect(getDisplayName("uid-1")).resolves.toBe("はなこ");
  });

  it("returns null when the profile document does not exist", async () => {
    get.mockResolvedValue({ data: () => undefined });
    await expect(getDisplayName("uid-1")).resolves.toBeNull();
  });

  it("returns null for a blank or non-string display name", async () => {
    get.mockResolvedValueOnce({ data: () => ({ displayName: "  " }) });
    get.mockResolvedValueOnce({ data: () => ({ displayName: 123 }) });
    await expect(getDisplayName("uid-1")).resolves.toBeNull();
    await expect(getDisplayName("uid-1")).resolves.toBeNull();
  });
});
