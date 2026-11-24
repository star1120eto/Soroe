import { describe, expect, it } from "vitest";

import {
  ENTITLEMENT_GRACE_PERIOD_MS as G,
  isPremiumPlan,
  resolveEffectivePlan,
  revenueCatWebhookBodySchema,
  type EntitlementDocument,
} from "./billing";

const doc = (o: Partial<EntitlementDocument> = {}): EntitlementDocument => ({
  status: "premium",
  productId: "soroe_premium_monthly",
  expiresAtMs: 1000,
  graceEndsAtMs: null,
  willRenew: true,
  environment: "SANDBOX",
  lastEventAtMs: 1,
  ...o,
});

describe("resolveEffectivePlan", () => {
  it("is free without a document", () => expect(resolveEffectivePlan(null, 5)).toBe("free"));
  it("is premium before expiry", () => expect(resolveEffectivePlan(doc(), 999)).toBe("premium"));
  it("is premium without a known expiry", () => expect(resolveEffectivePlan(doc({ expiresAtMs: null }), 9e12)).toBe("premium"));
  it("keeps premium features in the short grace window after expiry", () => {
    expect(resolveEffectivePlan(doc(), 1000)).toBe("grace");
    expect(resolveEffectivePlan(doc(), 1000 + G - 1)).toBe("grace");
  });
  it("expires after the grace window", () => expect(resolveEffectivePlan(doc(), 1000 + G)).toBe("expired"));
  it("expires immediately on an EXPIRATION status", () => expect(resolveEffectivePlan(doc({ status: "expired" }), 1)).toBe("expired"));
  it("handles billing issue until graceEndsAt", () => {
    const d = doc({ status: "billing-issue", graceEndsAtMs: 500 });
    expect(resolveEffectivePlan(d, 499)).toBe("grace");
    expect(resolveEffectivePlan(d, 500)).toBe("expired");
  });
  it("treats billing issue without graceEndsAt as expired", () =>
    expect(resolveEffectivePlan(doc({ status: "billing-issue" }), 1)).toBe("expired"));
  it("maps premium and grace to premium features", () => {
    expect(isPremiumPlan("premium")).toBe(true);
    expect(isPremiumPlan("grace")).toBe(true);
    expect(isPremiumPlan("expired")).toBe(false);
    expect(isPremiumPlan("free")).toBe(false);
  });
});

describe("revenueCatWebhookBodySchema", () => {
  it("accepts a typical event and ignores unknown fields", () => {
    const r = revenueCatWebhookBodySchema.safeParse({
      api_version: "1.0",
      event: { id: "e1", type: "RENEWAL", app_user_id: "u", event_timestamp_ms: 1, extra: 1 },
    });
    expect(r.success).toBe(true);
  });
  it("rejects a body without event id", () =>
    expect(revenueCatWebhookBodySchema.safeParse({ event: { type: "X", event_timestamp_ms: 1 } }).success).toBe(false));
});
