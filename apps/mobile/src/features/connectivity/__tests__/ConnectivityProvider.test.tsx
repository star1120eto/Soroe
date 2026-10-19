import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSession } from '../../session/SessionProvider';
import { ConnectivityProvider, useConnectivity } from '../ConnectivityProvider';
import { reconnect, subscribeToSyncState } from '../SyncStateRepository';

jest.mock('../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../SyncStateRepository', () => ({ subscribeToSyncState: jest.fn(), reconnect: jest.fn() }));

let emit: (state: { fromCache: boolean }) => void;
let emitError: (error: Error) => void;
const unsubscribe = jest.fn();

function wrapper({ children }: { children: ReactNode }) {
  return <ConnectivityProvider>{children}</ConnectivityProvider>;
}

describe('ConnectivityProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1' } } as ReturnType<typeof useSession>);
    jest.mocked(subscribeToSyncState).mockImplementation((_uid, onChange, onError) => {
      emit = onChange;
      emitError = onError;
      return unsubscribe;
    });
    jest.mocked(reconnect).mockResolvedValue();
  });
  afterEach(() => jest.useRealTimers());

  it('does not report offline for a cache-only response shorter than 3 seconds (cold start)', async () => {
    const { result } = await renderHook(() => useConnectivity(), { wrapper });

    await act(async () => emit({ fromCache: true }));
    await act(async () => jest.advanceTimersByTime(2999));

    expect(result.current.isOffline).toBe(false);
  });

  it('reports offline once the cache-only state lasts 3 seconds, and recovers immediately', async () => {
    const { result } = await renderHook(() => useConnectivity(), { wrapper });

    await act(async () => emit({ fromCache: true }));
    await act(async () => jest.advanceTimersByTime(3000));
    expect(result.current.isOffline).toBe(true);

    await act(async () => emit({ fromCache: false }));
    expect(result.current.isOffline).toBe(false);
  });

  it('ignores a second retry while one is running', async () => {
    let finish: () => void = () => {};
    jest.mocked(reconnect).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { result } = await renderHook(() => useConnectivity(), { wrapper });

    await act(async () => {
      void result.current.retry();
      void result.current.retry();
    });
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(result.current.isRetrying).toBe(true);

    await act(async () => finish());
    expect(result.current.isRetrying).toBe(false);
  });

  it('does not subscribe without a signed-in profile, and unsubscribes on unmount', async () => {
    jest.mocked(useSession).mockReturnValue({ profile: null } as ReturnType<typeof useSession>);
    const signedOut = await renderHook(() => useConnectivity(), { wrapper });
    expect(subscribeToSyncState).not.toHaveBeenCalled();
    await signedOut.unmount();

    jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1' } } as ReturnType<typeof useSession>);
    const signedIn = await renderHook(() => useConnectivity(), { wrapper });
    expect(subscribeToSyncState).toHaveBeenCalledWith('uid-1', expect.any(Function), expect.any(Function));
    await signedIn.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('does not report offline just because the subscription ended with an error', async () => {
    const { result } = await renderHook(() => useConnectivity(), { wrapper });

    await act(async () => emit({ fromCache: false }));
    await act(async () => emitError(new Error('permission-denied')));
    await act(async () => jest.advanceTimersByTime(5000));

    expect(result.current.isOffline).toBe(false);
  });

  it('swallows a failing reconnect and lets the user retry again', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(reconnect).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce();
    const { result } = await renderHook(() => useConnectivity(), { wrapper });

    await act(async () => {
      await expect(result.current.retry()).resolves.toBeUndefined();
    });
    expect(result.current.isRetrying).toBe(false);

    await act(async () => result.current.retry());
    expect(reconnect).toHaveBeenCalledTimes(2);
  });
});
