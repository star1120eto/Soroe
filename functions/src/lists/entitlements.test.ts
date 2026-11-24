import { getFirestore } from "firebase-admin/firestore";
import { ENTITLEMENT_GRACE_PERIOD_MS } from "@soroe/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPlan } from "./entitlements";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(),
}));

const mockGet = vi.fn();
const mockDoc = vi.fn().mockReturnValue({ get: mockGet });
const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });
const mockDb = { collection: mockCollection };

const ent = (o: Record<string, unknown> = {}) => ({
  status: "premium", productId: "p", expiresAtMs: 1000, graceEndsAtMs: null,
  willRenew: true, environment: "SANDBOX", lastEventAtMs: 1, ...o,
});

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

  it("returns free for a legacy/malformed document", async () => {
    mockGet.mockResolvedValue({ data: () => ({ plan: "premium" }) });
    await expect(getPlan("uid-1")).resolves.toBe("free");
  });

  it("returns premium before expiry", async () => {
    mockGet.mockResolvedValue({ data: () => ent() });
    await expect(getPlan("uid-1", 999)).resolves.toBe("premium");
  });

  it("keeps premium during the grace window after expiry", async () => {
    mockGet.mockResolvedValue({ data: () => ent() });
    await expect(getPlan("uid-1", 1000 + ENTITLEMENT_GRACE_PERIOD_MS - 1)).resolves.toBe("premium");
  });

  it("returns free once expired", async () => {
    mockGet.mockResolvedValue({ data: () => ent() });
    await expect(getPlan("uid-1", 1000 + ENTITLEMENT_GRACE_PERIOD_MS)).resolves.toBe("free");
    mockGet.mockResolvedValue({ data: () => ent({ status: "expired" }) });
    await expect(getPlan("uid-1", 1)).resolves.toBe("free");
  });
});
