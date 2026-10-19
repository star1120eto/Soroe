import { render } from '@testing-library/react-native';

import ListScreen from '../../../../app/(app)/index';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';
import { useSession } from '../../../session/SessionProvider';
import { subscribeToUserLists } from '../../ListRepository';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
jest.mock('../../ListRepository', () => ({ subscribeToUserLists: jest.fn() }));

const OFFLINE_MESSAGE = 'オフラインです。変更は端末に保存され、復帰後に自動で同期します';

function arrange({ offline, lists, fail = false }: { offline: boolean; lists: unknown[]; fail?: boolean }) {
  jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1' } } as ReturnType<typeof useSession>);
  jest.mocked(useConnectivity).mockReturnValue({ isOffline: offline, isRetrying: false, retry: jest.fn() });
  jest.mocked(subscribeToUserLists).mockImplementation((_uid, onChange, onError) => {
    if (fail) onError(new Error('failed'));
    else onChange(lists as never);
    return jest.fn();
  });
}

describe('ListScreen offline banner (OFF-001)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the banner even when the user has no lists', async () => {
    arrange({ offline: true, lists: [] });
    const { getByText } = await render(<ListScreen />);

    expect(getByText('リストがありません')).toBeTruthy();
    expect(getByText(OFFLINE_MESSAGE)).toBeTruthy();
  });

  it('shows the banner on the load error screen', async () => {
    arrange({ offline: true, lists: [], fail: true });
    const { getByText } = await render(<ListScreen />);

    expect(getByText('読み込みに失敗しました')).toBeTruthy();
    expect(getByText(OFFLINE_MESSAGE)).toBeTruthy();
  });

  it('shows no banner while online', async () => {
    arrange({ offline: false, lists: [] });
    const { queryByText } = await render(<ListScreen />);

    expect(queryByText(OFFLINE_MESSAGE)).toBeNull();
  });
});
