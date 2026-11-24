import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useSession } from '../../session/SessionProvider';
import { EntitlementProvider, useEntitlement } from '../EntitlementProvider';
import { FREE_SNAPSHOT } from '../entitlementModel';

jest.mock('../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../purchasesGateway', () => ({ purchasesGateway: {} }));

const premium = { isPremium: true, productId: 'soroe_premium_yearly', expiresAtMs: 1, willRenew: true };

function setup(status: 'authenticated' | 'unauthenticated') {
  let listener: (s: typeof premium) => void = () => {};
  const unsubscribe = jest.fn();
  const gateway = {
    configure: jest.fn().mockResolvedValue(true),
    subscribe: jest.fn((l) => {
      listener = l;
      return unsubscribe;
    }),
    getSnapshot: jest.fn().mockResolvedValue(premium),
  };
  jest.mocked(useSession).mockReturnValue({ status } as ReturnType<typeof useSession>);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <EntitlementProvider gateway={gateway as never}>{children}</EntitlementProvider>
  );
  return { gateway, unsubscribe, emit: (s: typeof premium) => listener(s), wrapper };
}

describe('EntitlementProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the snapshot after sign-in and follows SDK updates', async () => {
    const { wrapper, gateway, emit } = setup('authenticated');
    const { result } = await renderHook(() => useEntitlement(), { wrapper });

    await waitFor(() => expect(result.current.snapshot).toEqual(premium));
    expect(gateway.subscribe).toHaveBeenCalled();
    await act(() => emit({ ...premium, willRenew: false }));
    expect(result.current.snapshot.willRenew).toBe(false);
  });

  it('stays Free and does not touch the SDK data when signed out', async () => {
    const { wrapper, gateway } = setup('unauthenticated');
    const { result } = await renderHook(() => useEntitlement(), { wrapper });

    await waitFor(() => expect(gateway.configure).toHaveBeenCalled());
    expect(result.current.snapshot).toEqual(FREE_SNAPSHOT);
    expect(gateway.getSnapshot).not.toHaveBeenCalled();
  });

  it('resets to Free when the user signs out', async () => {
    const { wrapper } = setup('authenticated');
    const { result, rerender } = await renderHook(() => useEntitlement(), { wrapper });
    await waitFor(() => expect(result.current.snapshot.isPremium).toBe(true));

    jest.mocked(useSession).mockReturnValue({ status: 'unauthenticated' } as ReturnType<typeof useSession>);
    await rerender({});

    await waitFor(() => expect(result.current.snapshot).toEqual(FREE_SNAPSHOT));
  });
});
