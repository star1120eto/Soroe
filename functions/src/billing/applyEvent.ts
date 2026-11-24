import {
  ENTITLEMENT_GRACE_PERIOD_MS,
  REVENUECAT_ENTITLEMENT_ID,
  type EntitlementDocument,
  type RevenueCatEvent,
} from "@soroe/shared";

// PAY-004: RevenueCatイベント → 保存する権利の状態。Firestoreに触れない純粋関数。

export type ApplyResult =
  | { kind: "update"; doc: EntitlementDocument }
  | { kind: "ignore"; reason: "anonymous-user" | "other-entitlement" | "stale" | "unsupported-type" };

const GRANTING = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "REFUND_REVERSED",
  "SUBSCRIPTION_EXTENDED",
  "NON_RENEWING_PURCHASE",
]);

export function applyRevenueCatEvent(prev: EntitlementDocument | null, event: RevenueCatEvent): ApplyResult {
  if (!event.app_user_id || event.app_user_id.startsWith("$RCAnonymousID")) {
    return { kind: "ignore", reason: "anonymous-user" };
  }
  const ids = event.entitlement_ids;
  if (ids && ids.length > 0 && !ids.includes(REVENUECAT_ENTITLEMENT_ID)) {
    return { kind: "ignore", reason: "other-entitlement" };
  }
  // 順不同で届く古いイベントで新しい状態を巻き戻さない(同時刻は後勝ち)。
  if (prev && event.event_timestamp_ms < prev.lastEventAtMs) {
    return { kind: "ignore", reason: "stale" };
  }

  const base = {
    productId: event.product_id ?? prev?.productId ?? null,
    expiresAtMs: event.expiration_at_ms ?? prev?.expiresAtMs ?? null,
    environment: event.environment ?? prev?.environment ?? null,
    lastEventAtMs: event.event_timestamp_ms,
  };

  if (GRANTING.has(event.type)) {
    return { kind: "update", doc: { ...base, status: "premium", graceEndsAtMs: null, willRenew: true } };
  }
  switch (event.type) {
    case "CANCELLATION": {
      // 返金などで期間が既に終わっている場合は、猶予を与えず即失効にする。
      if (base.expiresAtMs !== null && base.expiresAtMs <= event.event_timestamp_ms) {
        return { kind: "update", doc: { ...base, status: "expired", graceEndsAtMs: null, willRenew: false } };
      }
      // 解約しても期間末までは有効。自動更新だけ止まる。
      return { kind: "update", doc: { ...base, status: "premium", graceEndsAtMs: null, willRenew: false } };
    }
    case "BILLING_ISSUE":
      return {
        kind: "update",
        doc: {
          ...base,
          status: "billing-issue",
          graceEndsAtMs: event.grace_period_expiration_at_ms ?? event.event_timestamp_ms + ENTITLEMENT_GRACE_PERIOD_MS,
          willRenew: true,
        },
      };
    case "EXPIRATION":
      return { kind: "update", doc: { ...base, status: "expired", graceEndsAtMs: null, willRenew: false } };
    default:
      return { kind: "ignore", reason: "unsupported-type" };
  }
}
