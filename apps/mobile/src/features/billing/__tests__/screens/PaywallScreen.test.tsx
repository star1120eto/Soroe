import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PaywallScreen from '../../../../app/paywall';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';
import { useEntitlement } from '../../EntitlementProvider';
import { FREE_SNAPSHOT } from '../../entitlementModel';

const mockRouter = { back: jest.fn() };
let mockParams: { trigger?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
jest.mock('../../EntitlementProvider', () => ({ useEntitlement: jest.fn() }));

const plans = [
  { kind: 'monthly' as const, productId: 'soroe_premium_monthly', priceString: '¥480' },
  { kind: 'yearly' as const, productId: 'soroe_premium_yearly', priceString: '¥4,800' },
];
const premiumSnapshot = { isPremium: true, productId: 'soroe_premium_yearly', expiresAtMs: 1, willRenew: true };

function arrange({ offline = false, snapshot = FREE_SNAPSHOT as typeof premiumSnapshot | typeof FREE_SNAPSHOT, loaded = plans } = {}) {
  const gateway = {
    getPlans: jest.fn().mockResolvedValue(loaded),
    purchase: jest.fn(),
    restore: jest.fn(),
  };
  const setSnapshot = jest.fn();
  jest.mocked(useConnectivity).mockReturnValue({ isOffline: offline, isRetrying: false, retry: jest.fn() });
  jest.mocked(useEntitlement).mockReturnValue({
    snapshot,
    gateway: gateway as never,
    setSnapshot,
    refresh: jest.fn().mockResolvedValue(undefined),
  });
  return { gateway, setSnapshot };
}

describe('PaywallScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it('shows prices, the yearly equivalent and the renewal / cancellation terms before purchase', async () => {
    arrange();
    const { findByText, getByText } = await render(<PaywallScreen />);

    expect(await findByText('年額プラン')).toBeTruthy();
    expect(getByText('¥4,800 / 年(月あたり約400円)')).toBeTruthy();
    expect(getByText('¥480 / 月')).toBeTruthy();
    expect(getByText('月額より約17%お得')).toBeTruthy();
    expect(getByText(/自動的に更新されます/)).toBeTruthy();
    expect(getByText(/サブスクリプション」から、いつでも/)).toBeTruthy();
    expect(getByText('利用規約')).toBeTruthy();
    expect(getByText('プライバシーポリシー')).toBeTruthy();
  });

  it('explains which limit was hit', async () => {
    mockParams = { trigger: 'ai-limit' };
    arrange();
    const { findByText } = await render(<PaywallScreen />);
    expect(await findByText('AI生成の回数を使い切りました')).toBeTruthy();
  });

  it('purchases the selected plan (yearly by default), reflects it, and returns to the previous screen', async () => {
    const { gateway, setSnapshot } = arrange();
    gateway.purchase.mockResolvedValue({ status: 'purchased', snapshot: premiumSnapshot });
    const { findByText, getByRole } = await render(<PaywallScreen />);
    await findByText('年額プラン');

    await fireEvent.press(getByRole('button', { name: 'Premiumを始める' }));

    await waitFor(() => expect(gateway.purchase).toHaveBeenCalledWith('soroe_premium_yearly'));
    expect(setSnapshot).toHaveBeenCalledWith(premiumSnapshot);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('purchases the monthly plan when selected', async () => {
    const { gateway } = arrange();
    gateway.purchase.mockResolvedValue({ status: 'cancelled' });
    const { findByText, getByText, getByRole } = await render(<PaywallScreen />);
    await findByText('月額プラン');

    await fireEvent.press(getByText('月額プラン'));
    await fireEvent.press(getByRole('button', { name: 'Premiumを始める' }));

    await waitFor(() => expect(gateway.purchase).toHaveBeenCalledWith('soroe_premium_monthly'));
  });

  it('stays on the screen silently when the user cancels', async () => {
    const { gateway } = arrange();
    gateway.purchase.mockResolvedValue({ status: 'cancelled' });
    const { findByText, getByRole, queryByText } = await render(<PaywallScreen />);
    await findByText('年額プラン');

    await fireEvent.press(getByRole('button', { name: 'Premiumを始める' }));

    await waitFor(() => expect(gateway.purchase).toHaveBeenCalled());
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(queryByText(/購入できませんでした/)).toBeNull();
  });

  it.each([
    [{ status: 'pending' }, '承認待ち'],
    [{ status: 'already-purchased' }, 'すでに購入済み'],
    [{ status: 'failed', reason: 'network' }, '通信に失敗しました'],
  ])('shows a state-specific message for %j', async (outcome, text) => {
    const { gateway } = arrange();
    gateway.purchase.mockResolvedValue(outcome);
    const { findByText, getByRole } = await render(<PaywallScreen />);
    await findByText('年額プラン');

    await fireEvent.press(getByRole('button', { name: 'Premiumを始める' }));

    expect(await findByText(new RegExp(text))).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('restores purchases, and explains when there is nothing to restore', async () => {
    const { gateway, setSnapshot } = arrange();
    gateway.restore.mockResolvedValueOnce({ status: 'nothing-to-restore' });
    const { findByText, getByRole } = await render(<PaywallScreen />);
    await findByText('年額プラン');

    await fireEvent.press(getByRole('button', { name: '購入を復元' }));
    expect(await findByText(/復元できる購入が見つかりませんでした/)).toBeTruthy();

    gateway.restore.mockResolvedValueOnce({ status: 'restored', snapshot: premiumSnapshot });
    await fireEvent.press(getByRole('button', { name: '購入を復元' }));
    await waitFor(() => expect(setSnapshot).toHaveBeenCalledWith(premiumSnapshot));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('closes without side effects', async () => {
    const { gateway } = arrange();
    const { findByText, getByRole } = await render(<PaywallScreen />);
    await findByText('年額プラン');

    await fireEvent.press(getByRole('button', { name: '閉じる' }));

    expect(mockRouter.back).toHaveBeenCalled();
    expect(gateway.purchase).not.toHaveBeenCalled();
  });

  it('disables purchase and restore offline, with the reason', async () => {
    arrange({ offline: true });
    const { findByText, getByRole } = await render(<PaywallScreen />);
    await findByText('年額プラン');

    expect(getByRole('button', { name: 'Premiumを始める' })).toBeDisabled();
    expect(getByRole('button', { name: '購入を復元' })).toBeDisabled();
  });

  it('shows an error and disables purchase when no plan can be loaded', async () => {
    arrange({ loaded: [] });
    const { findByText, getByRole } = await render(<PaywallScreen />);

    expect(await findByText(/プランを読み込めませんでした/)).toBeTruthy();
    expect(getByRole('button', { name: 'Premiumを始める' })).toBeDisabled();
  });

  it('shows the active status instead of the offer for a Premium user', async () => {
    arrange({ snapshot: premiumSnapshot });
    const { findByText, queryByText } = await render(<PaywallScreen />);

    expect(await findByText('Premiumをご利用中です')).toBeTruthy();
    expect(queryByText('Premiumを始める')).toBeNull();
  });
});
