import { PREMIUM_PRODUCT_IDS, REVENUECAT_ENTITLEMENT_ID } from '@soroe/shared';

// PAY-002: RevenueCat SDKの型に依存しない、権利まわりの純粋なモデル。
// UI表示用の状態であり、機能の可否(上限など)はサーバー(FunctionsのgetPlan)が判定する。

export type EntitlementSnapshot = {
  isPremium: boolean;
  productId: string | null;
  expiresAtMs: number | null;
  willRenew: boolean;
};

export const FREE_SNAPSHOT: EntitlementSnapshot = {
  isPremium: false,
  productId: null,
  expiresAtMs: null,
  willRenew: false,
};

// react-native-purchasesのCustomerInfoのうち、読む項目だけ。
export type CustomerInfoLike = {
  entitlements: {
    active: Record<
      string,
      { isActive: boolean; productIdentifier: string; expirationDateMillis: number | null; willRenew: boolean } | undefined
    >;
  };
};

export function toEntitlementSnapshot(info: CustomerInfoLike): EntitlementSnapshot {
  const entitlement = info.entitlements.active[REVENUECAT_ENTITLEMENT_ID];
  if (!entitlement?.isActive) {
    return FREE_SNAPSHOT;
  }
  return {
    isPremium: true,
    productId: entitlement.productIdentifier,
    expiresAtMs: entitlement.expirationDateMillis,
    willRenew: entitlement.willRenew,
  };
}

export type PremiumPlanKind = keyof typeof PREMIUM_PRODUCT_IDS;

/** 購入できるプラン(画面表示用)。 */
export type PurchasablePlan = {
  kind: PremiumPlanKind;
  productId: string;
  /** ストアが返すローカライズ済みの価格文字列。 */
  priceString: string;
};

// 購入結果。キャンセルと保留はエラーではない(PAY-01「状態別メッセージ」)。
export type PurchaseOutcome =
  | { status: 'purchased'; snapshot: EntitlementSnapshot }
  | { status: 'cancelled' }
  | { status: 'pending' }
  | { status: 'already-purchased' }
  | { status: 'failed'; reason: 'network' | 'store' | 'unknown' };

export type RestoreOutcome =
  | { status: 'restored'; snapshot: EntitlementSnapshot }
  | { status: 'nothing-to-restore' }
  | { status: 'failed'; reason: 'network' | 'store' | 'unknown' };

export function classifyPurchaseError(error: unknown): Exclude<PurchaseOutcome, { status: 'purchased' }> {
  const e = (error ?? {}) as { userCancelled?: boolean | null; readableErrorCode?: string };
  if (e.userCancelled || e.readableErrorCode === 'PURCHASE_CANCELLED_ERROR') {
    return { status: 'cancelled' };
  }
  switch (e.readableErrorCode) {
    case 'PAYMENT_PENDING_ERROR':
      return { status: 'pending' };
    case 'PRODUCT_ALREADY_PURCHASED_ERROR':
      return { status: 'already-purchased' };
    case 'NETWORK_ERROR':
    case 'OFFLINE_CONNECTION_ERROR':
      return { status: 'failed', reason: 'network' };
    case 'STORE_PROBLEM_ERROR':
    case 'PURCHASE_NOT_ALLOWED_ERROR':
    case 'PURCHASE_INVALID_ERROR':
    case 'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR':
      return { status: 'failed', reason: 'store' };
    default:
      return { status: 'failed', reason: 'unknown' };
  }
}

/** 復元結果。有効な権利がなければ「対象なし」(説明を出す)。 */
export function toRestoreOutcome(snapshot: EntitlementSnapshot): RestoreOutcome {
  return snapshot.isPremium ? { status: 'restored', snapshot } : { status: 'nothing-to-restore' };
}

export function planKindForProduct(productId: string): PremiumPlanKind | null {
  const found = (Object.entries(PREMIUM_PRODUCT_IDS) as [PremiumPlanKind, string][]).find(([, id]) => id === productId);
  return found ? found[0] : null;
}
