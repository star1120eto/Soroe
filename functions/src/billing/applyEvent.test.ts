import { ENTITLEMENT_GRACE_PERIOD_MS, type EntitlementDocument, type RevenueCatEvent } from "@soroe/shared";
import { describe, expect, it } from "vitest";

import { applyRevenueCatEvent } from "./applyEvent";

const ev = (o: Partial<RevenueCatEvent> = {}): RevenueCatEvent => ({
  id: "e1",
  type: "INITIAL_PURCHASE",
  app_user_id: "uid-1",
  product_id: "soroe_premium_monthly",
  entitlement_ids: ["premium"],
  expiration_at_ms: 5000,
  event_timestamp_ms: 100,
  environment: "SANDBOX",
  ...o,
});
const prev = (o: Partial<EntitlementDocument> = {}): EntitlementDocument => ({
  status: "premium", productId: "soroe_premium_monthly", expiresAtMs: 5000, graceEndsAtMs: null,
  willRenew: true, environment: "SANDBOX", lastEventAtMs: 100, ...o,
});
const doc = (r: ReturnType<typeof applyRevenueCatEvent>) => {
  if (r.kind !== "update") throw new Error(`expected update, got ${r.reason}`);
  return r.doc;
};

describe("applyRevenueCatEvent", () => {
  it.each(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "REFUND_REVERSED"])(
    "%s grants premium until expiration",
    (type) => {
      expect(doc(applyRevenueCatEvent(null, ev({ type })))).toMatchObject({
        status: "premium", expiresAtMs: 5000, willRenew: true, lastEventAtMs: 100,
      });
    }
  );

  it("CANCELLATION keeps premium but stops renewal", () => {
    expect(doc(applyRevenueCatEvent(prev(), ev({ type: "CANCELLATION", event_timestamp_ms: 200 })))).toMatchObject({
      status: "premium", willRenew: false, expiresAtMs: 5000,
    });
  });

  it("BILLING_ISSUE starts a grace period (provided end, else default length)", () => {
    expect(doc(applyRevenueCatEvent(prev(), ev({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: 9000 })))).toMatchObject({
      status: "billing-issue", graceEndsAtMs: 9000,
    });
    expect(doc(applyRevenueCatEvent(prev(), ev({ type: "BILLING_ISSUE", event_timestamp_ms: 300 }))).graceEndsAtMs).toBe(
      300 + ENTITLEMENT_GRACE_PERIOD_MS
    );
  });

  it("EXPIRATION expires immediately", () => {
    expect(doc(applyRevenueCatEvent(prev(), ev({ type: "EXPIRATION", event_timestamp_ms: 6000 })))).toMatchObject({
      status: "expired", willRenew: false,
    });
  });

  it("re-subscription after expiry releases premium again", () => {
    const expired = prev({ status: "expired", willRenew: false, lastEventAtMs: 6000 });
    expect(doc(applyRevenueCatEvent(expired, ev({ type: "INITIAL_PURCHASE", event_timestamp_ms: 7000, expiration_at_ms: 99999 })))).toMatchObject({
      status: "premium", expiresAtMs: 99999, graceEndsAtMs: null,
    });
  });

  it("keeps previous product/expiry when the event omits them", () => {
    expect(doc(applyRevenueCatEvent(prev(), ev({ type: "EXPIRATION", product_id: null, expiration_at_ms: null, event_timestamp_ms: 200 })))).toMatchObject({
      productId: "soroe_premium_monthly", expiresAtMs: 5000,
    });
  });

  it("ignores stale out-of-order events but accepts equal timestamps", () => {
    expect(applyRevenueCatEvent(prev({ lastEventAtMs: 500 }), ev({ event_timestamp_ms: 499 }))).toEqual({ kind: "ignore", reason: "stale" });
    expect(applyRevenueCatEvent(prev({ lastEventAtMs: 500 }), ev({ event_timestamp_ms: 500 })).kind).toBe("update");
  });

  it("ignores anonymous users, other entitlements and unsupported types", () => {
    expect(applyRevenueCatEvent(null, ev({ app_user_id: "$RCAnonymousID:abc" }))).toEqual({ kind: "ignore", reason: "anonymous-user" });
    expect(applyRevenueCatEvent(null, ev({ app_user_id: undefined }))).toEqual({ kind: "ignore", reason: "anonymous-user" });
    expect(applyRevenueCatEvent(null, ev({ entitlement_ids: ["other"] }))).toEqual({ kind: "ignore", reason: "other-entitlement" });
    expect(applyRevenueCatEvent(null, ev({ type: "TEST" }))).toEqual({ kind: "ignore", reason: "unsupported-type" });
  });
});
