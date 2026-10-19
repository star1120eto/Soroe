import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AiScreen from '../../../../app/(app)/ai';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';
import { useSession } from '../../../session/SessionProvider';
import { getAiQuota } from '../../AiRepository';
import { readPendingAiRequest } from '../../pendingAiRequest';

const mockRouter = { push: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  // 画面にフォーカスしたときに実行する(テストでは描画時に1回)。
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, []),
}));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
jest.mock('../../AiRepository', () => ({ getAiQuota: jest.fn() }));
jest.mock('../../pendingAiRequest', () => ({ readPendingAiRequest: jest.fn() }));

const free = (used: number) => ({ plan: 'free' as const, used, limit: 1, remaining: 1 - used, resetsAt: null });
const premium = (used: number) => ({ plan: 'premium' as const, used, limit: 20, remaining: 20 - used, resetsAt: Date.UTC(2026, 9, 31, 15, 0, 0) });

function arrange({ quota = free(0) as ReturnType<typeof free> | ReturnType<typeof premium>, offline = false, pending = null as string | null, fail = false } = {}) {
  jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1', language: 'ja' } } as ReturnType<typeof useSession>);
  jest.mocked(useConnectivity).mockReturnValue({ isOffline: offline, isRetrying: false, retry: jest.fn() });
  if (fail) jest.mocked(getAiQuota).mockRejectedValue(new Error('offline'));
  else jest.mocked(getAiQuota).mockResolvedValue(quota);
  jest.mocked(readPendingAiRequest).mockResolvedValue(pending);
}

describe('AiScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tells a Free user they have one free generation, and starts the flow', async () => {
    arrange();
    const { findByText, getByRole } = await render(<AiScreen />);

    expect(await findByText('無料で1回、リストを作れます')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'リストを作る' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/ai-flow');
  });

  it('explains that the free generation is used up, and disables starting', async () => {
    arrange({ quota: free(1) });
    const { findByText, getByRole } = await render(<AiScreen />);

    expect(await findByText('無料の生成(1回)は使用済みです')).toBeTruthy();
    expect(getByRole('button', { name: 'リストを作る' })).toBeDisabled();
  });

  it('shows a Premium user the remaining uses and the next reset date', async () => {
    arrange({ quota: premium(3) });
    const { findByText } = await render(<AiScreen />);

    expect(await findByText('今月あと17回(上限20回)')).toBeTruthy();
    expect(await findByText('次回のリセットは11月1日です')).toBeTruthy();
  });

  it('disables starting at the monthly limit and shows the reset date', async () => {
    arrange({ quota: premium(20) });
    const { findByText, getByRole } = await render(<AiScreen />);

    expect(await findByText('今月の生成回数(20回)を使い切りました')).toBeTruthy();
    expect(getByRole('button', { name: 'リストを作る' })).toBeDisabled();
  });

  it('disables starting while offline and says why', async () => {
    arrange({ offline: true });
    const { findByText, getByRole } = await render(<AiScreen />);

    expect(await findByText('オフラインのため使えません。オンライン接続が必要です')).toBeTruthy();
    expect(getByRole('button', { name: 'リストを作る' })).toBeDisabled();
  });

  it('offers the previous unsaved result when one is remembered', async () => {
    arrange({ pending: 'req-9' });
    const { findByRole } = await render(<AiScreen />);

    await fireEvent.press(await findByRole('button', { name: '前回の結果を見る' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/ai-result', params: { requestId: 'req-9' } });
  });

  it('shows an error when the remaining uses cannot be loaded', async () => {
    arrange({ fail: true });
    const { findByText } = await render(<AiScreen />);

    await waitFor(async () => expect(await findByText('残り回数を読み込めませんでした')).toBeTruthy());
  });
});
