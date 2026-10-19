import { fireEvent, render } from '@testing-library/react-native';

import { OfflineBanner } from '../OfflineBanner';
import { OFFLINE_BANNER_MESSAGE } from '../offlineMessages';

describe('OfflineBanner', () => {
  it('shows the offline message with the pending count and a retry button', async () => {
    const onRetry = jest.fn();
    const { getByText, getByRole } = await render(
      <OfflineBanner isOffline pendingCount={2} isRetrying={false} onRetry={onRetry} />
    );

    expect(getByText(OFFLINE_BANNER_MESSAGE)).toBeTruthy();
    expect(getByText('未同期 2件')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: '再試行' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows a syncing note when online with pending writes', async () => {
    const { getByText, queryByRole } = await render(
      <OfflineBanner isOffline={false} pendingCount={3} isRetrying={false} onRetry={jest.fn()} />
    );

    expect(getByText('同期中です(3件)')).toBeTruthy();
    expect(queryByRole('button', { name: '再試行' })).toBeNull();
  });

  it('renders nothing when online with nothing pending', async () => {
    const { toJSON } = await render(
      <OfflineBanner isOffline={false} pendingCount={0} isRetrying={false} onRetry={jest.fn()} />
    );

    expect(toJSON()).toBeNull();
  });
});
