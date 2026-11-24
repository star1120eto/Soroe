import { getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { processRevenueCatEvent } from "./entitlementStore";

vi.mock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));

const event = { id: "e1", type: "INITIAL_PURCHASE", app_user_id: "uid-1", event_timestamp_ms: 10, expiration_at_ms: 99 };

function setup(existing: { event?: boolean; ent?: unknown }) {
  const set = vi.fn();
  const docs: Record<string, { path: string }> = {};
  const db = {
    collection: (c: string) => ({ doc: (id: string) => (docs[`${c}/${id}`] ??= { path: `${c}/${id}` }) }),
    runTransaction: (fn: (tx: unknown) => unknown) =>
      fn({
        get: async (ref: { path: string }) =>
          ref.path.startsWith("webhookEvents")
            ? { exists: !!existing.event }
            : { exists: existing.ent !== undefined, data: () => existing.ent },
        set,
      }),
  };
  vi.mocked(getFirestore).mockReturnValue(db as never);
  return set;
}

describe("processRevenueCatEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the entitlement and the event marker together", async () => {
    const set = setup({});
    await expect(processRevenueCatEvent(event, 1)).resolves.toEqual({ status: "applied" });
    const paths = set.mock.calls.map((c) => c[0].path);
    expect(paths).toEqual(["webhookEvents/revenuecat_e1", "entitlements/uid-1"]);
    expect(set.mock.calls[1][1]).toMatchObject({ status: "premium", expiresAtMs: 99 });
  });

  it("does nothing for an already processed event id", async () => {
    const set = setup({ event: true });
    await expect(processRevenueCatEvent(event, 1)).resolves.toEqual({ status: "duplicate" });
    expect(set).not.toHaveBeenCalled();
  });

  it("records ignored events without changing the entitlement", async () => {
    const set = setup({});
    await expect(processRevenueCatEvent({ ...event, type: "TEST" }, 1)).resolves.toEqual({
      status: "ignored",
      reason: "unsupported-type",
    });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][1]).not.toHaveProperty("email");
  });

  it("treats a malformed stored document as absent", async () => {
    const set = setup({ ent: { plan: "premium" } });
    await expect(processRevenueCatEvent(event, 1)).resolves.toEqual({ status: "applied" });
    expect(set).toHaveBeenCalledTimes(2);
  });
});
