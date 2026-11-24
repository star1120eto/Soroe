import {
  classifyPurchaseError,
  FREE_SNAPSHOT,
  planKindForProduct,
  toEntitlementSnapshot,
  toRestoreOutcome,
} from '../entitlementModel';

const info = (active: Record<string, unknown>) => ({ entitlements: { active } }) as never;
const premium = (o = {}) => ({
  isActive: true, productIdentifier: 'soroe_premium_yearly', expirationDateMillis: 123, willRenew: true, ...o,
});

describe('toEntitlementSnapshot', () => {
  it('is free without the premium entitlement', () => {
    expect(toEntitlementSnapshot(info({}))).toEqual(FREE_SNAPSHOT);
    expect(toEntitlementSnapshot(info({ other: premium() }))).toEqual(FREE_SNAPSHOT);
  });
  it('is premium with an active entitlement', () => {
    expect(toEntitlementSnapshot(info({ premium: premium() }))).toEqual({
      isPremium: true, productId: 'soroe_premium_yearly', expiresAtMs: 123, willRenew: true,
    });
  });
  it('is free when the entitlement is inactive', () => {
    expect(toEntitlementSnapshot(info({ premium: premium({ isActive: false }) }))).toEqual(FREE_SNAPSHOT);
  });
});

describe('classifyPurchaseError', () => {
  it('treats user cancel as cancelled, not an error', () => {
    expect(classifyPurchaseError({ userCancelled: true })).toEqual({ status: 'cancelled' });
    expect(classifyPurchaseError({ readableErrorCode: 'PURCHASE_CANCELLED_ERROR' })).toEqual({ status: 'cancelled' });
  });
  it('maps pending and already purchased', () => {
    expect(classifyPurchaseError({ readableErrorCode: 'PAYMENT_PENDING_ERROR' })).toEqual({ status: 'pending' });
    expect(classifyPurchaseError({ readableErrorCode: 'PRODUCT_ALREADY_PURCHASED_ERROR' })).toEqual({ status: 'already-purchased' });
  });
  it('maps network, store and unknown failures', () => {
    expect(classifyPurchaseError({ readableErrorCode: 'NETWORK_ERROR' })).toEqual({ status: 'failed', reason: 'network' });
    expect(classifyPurchaseError({ readableErrorCode: 'STORE_PROBLEM_ERROR' })).toEqual({ status: 'failed', reason: 'store' });
    expect(classifyPurchaseError(new Error('x'))).toEqual({ status: 'failed', reason: 'unknown' });
    expect(classifyPurchaseError(undefined)).toEqual({ status: 'failed', reason: 'unknown' });
  });
});

describe('restore / plan helpers', () => {
  it('reports nothing to restore for free', () => {
    expect(toRestoreOutcome(FREE_SNAPSHOT)).toEqual({ status: 'nothing-to-restore' });
  });
  it('reports restored for premium', () => {
    const snapshot = { ...FREE_SNAPSHOT, isPremium: true };
    expect(toRestoreOutcome(snapshot)).toEqual({ status: 'restored', snapshot });
  });
  it('maps product ids to plan kinds', () => {
    expect(planKindForProduct('soroe_premium_monthly')).toBe('monthly');
    expect(planKindForProduct('soroe_premium_yearly')).toBe('yearly');
    expect(planKindForProduct('nope')).toBeNull();
  });
});
