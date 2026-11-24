import { z } from "zod";

// soroe-functional-specification.md 2章(プラン)・9章(PAY-01)。時刻はミリ秒epoch。
// PAY-001(App Store Connect/RevenueCat設定)が未完了のため、ID類は暫定値。確定したらここだけを直す。

/** RevenueCatのEntitlement識別子(暫定)。 */
export const REVENUECAT_ENTITLEMENT_ID = "premium";
/** App Store Connectの商品ID(暫定)。 */
export const PREMIUM_PRODUCT_IDS = {
  monthly: "soroe_premium_monthly",
  yearly: "soroe_premium_yearly",
} as const;

/** 決済更新の確認が遅れた場合に、直前のPremiumを維持する期間(暫定3日)。 */
export const ENTITLEMENT_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

// 保存する権利の状態。実効プラン(free/premium/grace/expired)は読取時刻から導くため、ここには
// 時刻依存の値を持たない。
export const entitlementStatusSchema = z.enum(["premium", "billing-issue", "expired"]);
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

export const entitlementDocumentSchema = z.object({
  status: entitlementStatusSchema,
  productId: z.string().nullable(),
  /** 現在の購読期間の終了。nullは不明。 */
  expiresAtMs: z.number().int().nullable(),
  /** BILLING_ISSUE時の猶予終了。 */
  graceEndsAtMs: z.number().int().nullable(),
  willRenew: z.boolean(),
  environment: z.enum(["PRODUCTION", "SANDBOX"]).nullable(),
  /** 最後に反映したRevenueCatイベントの時刻。古いイベントの巻き戻し防止に使う。 */
  lastEventAtMs: z.number().int(),
});
export type EntitlementDocument = z.infer<typeof entitlementDocumentSchema>;

export type EffectivePlan = "free" | "premium" | "grace" | "expired";

/** 読取時刻における実効プラン。graceはPremium機能を維持する(`isPremiumPlan`)。 */
export function resolveEffectivePlan(doc: EntitlementDocument | null, nowMs: number): EffectivePlan {
  if (!doc) return "free";
  if (doc.status === "expired") return "expired";
  if (doc.status === "billing-issue") {
    return doc.graceEndsAtMs !== null && nowMs < doc.graceEndsAtMs ? "grace" : "expired";
  }
  // premium: 期間内はpremium。期限超過でもEXPIRATIONイベント未着の間だけ短期猶予。
  if (doc.expiresAtMs === null || nowMs < doc.expiresAtMs) return "premium";
  return nowMs < doc.expiresAtMs + ENTITLEMENT_GRACE_PERIOD_MS ? "grace" : "expired";
}

export const isPremiumPlan = (plan: EffectivePlan) => plan === "premium" || plan === "grace";

// RevenueCat Webhookのpayload(使う項目のみ。未知の項目は無視)。
export const revenueCatEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  app_user_id: z.string().min(1).optional(),
  product_id: z.string().nullish(),
  entitlement_ids: z.array(z.string()).nullish(),
  expiration_at_ms: z.number().nullish(),
  grace_period_expiration_at_ms: z.number().nullish(),
  event_timestamp_ms: z.number(),
  environment: z.enum(["PRODUCTION", "SANDBOX"]).nullish(),
  cancel_reason: z.string().nullish(),
});
export type RevenueCatEvent = z.infer<typeof revenueCatEventSchema>;

export const revenueCatWebhookBodySchema = z.object({ event: revenueCatEventSchema });
