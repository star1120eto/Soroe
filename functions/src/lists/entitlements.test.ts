import { getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPlan } from "./entitlements";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(),
}));

const mockGet = vi.fn();
const mockDoc = vi.fn().mockReturnValue({ get: mockGet });
const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });
const mockDb = { collection: mockCollection };

describe("getPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFirestore).mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestore>);
  });

  it("returns free when no entitlements document exists", async () => {
    mockGet.mockResolvedValue({ data: () => undefined });
    await expect(getPlan("uid-1")).resolves.toBe("free");
    expect(mockCollection).toHaveBeenCalledWith("entitlements");
    expect(mockDoc).toHaveBeenCalledWith("uid-1");
  });

  it("returns free when the document has no premium plan", async () => {
    mockGet.mockResolvedValue({ data: () => ({ plan: "free" }) });
    await expect(getPlan("uid-1")).resolves.toBe("free");
  });

  it("returns premium when entitled", async () => {
    mockGet.mockResolvedValue({ data: () => ({ plan: "premium" }) });
    await expect(getPlan("uid-1")).resolves.toBe("premium");
  });
});
