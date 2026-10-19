import { render } from '@testing-library/react-native';

import NewListMethodScreen from '../../../../app/new-list-method';
import NewListScreen from '../../../../app/new-list';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';

const mockParams: { listId?: string } = {};
const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
jest.mock('../../ListRepository', () => ({
  createList: jest.fn(),
  subscribeToList: jest.fn(() => jest.fn()),
  updateList: jest.fn(),
}));

const OFFLINE_REASON = 'オフラインのため使えません。オンライン接続が必要です';

function connectivity(isOffline: boolean) {
  jest.mocked(useConnectivity).mockReturnValue({ isOffline, isRetrying: false, retry: jest.fn() });
}

describe('creating a list while offline (OFF-001)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockParams.listId;
  });

  it('disables creating a new list and says why', async () => {
    connectivity(true);
    const { getByRole, getByText } = await render(<NewListScreen />);

    expect(getByText(OFFLINE_REASON)).toBeTruthy();
    expect(getByRole('button', { name: '作成する' })).toBeDisabled();
  });

  it('keeps creating enabled while online', async () => {
    connectivity(false);
    const { getByRole, queryByText } = await render(<NewListScreen />);

    expect(queryByText(OFFLINE_REASON)).toBeNull();
    expect(getByRole('button', { name: '作成する' })).not.toBeDisabled();
  });

  it('keeps editing an existing list available offline (it is a local write)', async () => {
    connectivity(true);
    mockParams.listId = 'list-1';
    const { getByRole, queryByText } = await render(<NewListScreen />);

    expect(queryByText(OFFLINE_REASON)).toBeNull();
    expect(getByRole('button', { name: '保存する' })).not.toBeDisabled();
  });

  it('disables creating with AI while offline but not the blank-list or template routes', async () => {
    connectivity(true);
    const { getByRole, getByText } = await render(<NewListMethodScreen />);

    expect(getByText(OFFLINE_REASON)).toBeTruthy();
    expect(getByRole('button', { name: 'AIで作る' })).toBeDisabled();
    expect(getByRole('button', { name: '空のリストから' })).not.toBeDisabled();
    expect(getByRole('button', { name: 'テンプレートから' })).not.toBeDisabled();
  });
});
