import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import AiFlowScreen from '../../../../app/ai-flow';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';
import { useSession } from '../../../session/SessionProvider';
import { generateList, loadGenerationProfile, saveGenerationProfile } from '../../AiRepository';
import { savePendingAiRequest } from '../../pendingAiRequest';

const mockRouter = { replace: jest.fn(), back: jest.fn() };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter, Redirect: () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
jest.mock('../../AiRepository', () => ({
  generateList: jest.fn(),
  loadGenerationProfile: jest.fn(),
  saveGenerationProfile: jest.fn(),
}));
jest.mock('../../pendingAiRequest', () => ({ savePendingAiRequest: jest.fn() }));

function arrange({ offline = false, language = 'ja', profile = null as unknown } = {}) {
  jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1', language } } as ReturnType<typeof useSession>);
  jest.mocked(useConnectivity).mockReturnValue({ isOffline: offline, isRetrying: false, retry: jest.fn() });
  jest.mocked(loadGenerationProfile).mockResolvedValue(profile as never);
  jest.mocked(saveGenerationProfile).mockResolvedValue();
  jest.mocked(savePendingAiRequest).mockResolvedValue();
  jest.mocked(generateList).mockResolvedValue({ status: 'in-progress' });
}

const next = (screen: ReturnType<typeof render> extends Promise<infer R> ? R : never) => fireEvent.press(screen.getByRole('button', { name: 'つぎへ' }));

describe('AiFlowScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('needs a use case before moving on', async () => {
    arrange();
    const screen = await render(<AiFlowScreen />);

    await next(screen);

    expect(await screen.findByText('用途を選んでください')).toBeTruthy();
  });

  it('asks for an age band only when there are children, and keeps values when going back', async () => {
    arrange();
    const screen = await render(<AiFlowScreen />);

    await fireEvent.press(screen.getByRole('button', { name: '登山' }));
    await next(screen);
    expect(screen.queryByRole('button', { name: '小学生' })).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('子どもの人数'), '1');
    expect(screen.getByRole('button', { name: '小学生' })).toBeTruthy();
    await next(screen);
    expect(await screen.findByText('子どもの年齢帯を選んでください')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: '小学生' }));
    await next(screen);
    await fireEvent.press(screen.getByRole('button', { name: 'もどる' }));
    expect(screen.getByLabelText('子どもの人数').props.value).toBe('1');
  });

  it('starts from the saved conditions', async () => {
    arrange({ profile: { useCase: 'travel', adults: 3, children: 0, ageBands: [], nights: 2, season: 'summer', features: ['car'] } });
    const screen = await render(<AiFlowScreen />);

    await waitFor(() => expect(screen.getByRole('button', { name: '旅行' }).props.accessibilityState.selected).toBe(true));
    await next(screen);
    expect(screen.getByLabelText('大人の人数').props.value).toBe('3');
  });

  async function reachConfirmation(screen: Awaited<ReturnType<typeof render>>) {
    await fireEvent.press(screen.getByRole('button', { name: '登山' }));
    await next(screen);
    await next(screen);
    await fireEvent.changeText(screen.getByLabelText('メモ(任意)'), '  初心者です  ');
    await next(screen);
  }

  it('shows a summary and starts the generation with the normalized input, then opens the result screen', async () => {
    arrange();
    const screen = await render(<AiFlowScreen />);

    await reachConfirmation(screen);
    expect(screen.getByText('初心者です')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '生成する' }));

    await waitFor(() => expect(generateList).toHaveBeenCalledTimes(1));
    expect(generateList).toHaveBeenCalledWith({
      requestId: 'uuid-1',
      input: expect.objectContaining({ useCase: 'hiking', adults: 2, children: 0, ageBands: [], notes: '初心者です', language: 'ja' }),
    });
    expect(savePendingAiRequest).toHaveBeenCalledWith('uuid-1');
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/ai-result', params: { requestId: 'uuid-1' } });
    expect(saveGenerationProfile).not.toHaveBeenCalled();
  });

  it('saves the conditions only when "next time too" is chosen', async () => {
    arrange();
    const screen = await render(<AiFlowScreen />);

    await reachConfirmation(screen);
    await fireEvent.press(screen.getByRole('button', { name: '次回も使う' }));
    await fireEvent.press(screen.getByRole('button', { name: '生成する' }));

    await waitFor(() => expect(saveGenerationProfile).toHaveBeenCalledTimes(1));
    expect(saveGenerationProfile).toHaveBeenCalledWith('uid-1', expect.objectContaining({ useCase: 'hiking', adults: 2 }));
    expect(jest.mocked(saveGenerationProfile).mock.calls[0][1]).not.toHaveProperty('notes');
  });

  it('disables generating while offline and says why', async () => {
    arrange({ offline: true });
    const screen = await render(<AiFlowScreen />);

    await reachConfirmation(screen);

    expect(screen.getByText('オフラインのため使えません。オンライン接続が必要です')).toBeTruthy();
    expect(screen.getByRole('button', { name: '生成する' })).toBeDisabled();
  });
});
