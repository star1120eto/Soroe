import {
  parsePaywallTrigger,
  purchaseNotice,
  restoreNotice,
  yearlyDiscountPercent,
  yearlyMonthlyEquivalentJpy,
} from '../paywallModel';
import { FREE_SNAPSHOT } from '../entitlementModel';

describe('paywall pricing', () => {
  it('derives the monthly equivalent and the honest discount from list prices', () => {
    expect(yearlyMonthlyEquivalentJpy).toBe(400);
    expect(yearlyDiscountPercent).toBe(17);
  });
});

describe('parsePaywallTrigger', () => {
  it('accepts known triggers (also as array params) and falls back to settings', () => {
    expect(parsePaywallTrigger('ai-limit')).toBe('ai-limit');
    expect(parsePaywallTrigger(['list-limit'])).toBe('list-limit');
    expect(parsePaywallTrigger('bogus')).toBe('settings');
    expect(parsePaywallTrigger(undefined)).toBe('settings');
  });
});

describe('notices', () => {
  it('shows nothing for success and cancel', () => {
    expect(purchaseNotice({ status: 'purchased', snapshot: FREE_SNAPSHOT })).toBeNull();
    expect(purchaseNotice({ status: 'cancelled' })).toBeNull();
    expect(restoreNotice({ status: 'restored', snapshot: FREE_SNAPSHOT })).toBeNull();
  });
  it('explains pending, already purchased and failures', () => {
    expect(purchaseNotice({ status: 'pending' })?.message).toContain('承認待ち');
    expect(purchaseNotice({ status: 'already-purchased' })?.message).toContain('復元');
    expect(purchaseNotice({ status: 'failed', reason: 'network' })).toMatchObject({ variant: 'danger' });
    expect(restoreNotice({ status: 'nothing-to-restore' })?.message).toContain('見つかりませんでした');
    expect(restoreNotice({ status: 'failed', reason: 'store' })).toMatchObject({ variant: 'danger' });
  });
});
