import { act, renderHook } from '@testing-library/react-native';

import { SessionProvider, useSession } from '../SessionProvider';

describe('useSession', () => {
  it('starts unauthenticated and toggles via signInForDev/signOutForDev', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    expect(result.current.status).toBe('unauthenticated');

    await act(() => result.current.signInForDev());
    expect(result.current.status).toBe('authenticated');

    await act(() => result.current.signOutForDev());
    expect(result.current.status).toBe('unauthenticated');
  });
});
