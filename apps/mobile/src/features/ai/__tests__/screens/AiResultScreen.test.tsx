import { act, fireEvent, render } from '@testing-library/react-native';
import type { AiResult } from '@soroe/shared';

import AiResultScreen from '../../../../app/ai-result';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';
import { useSession } from '../../../session/SessionProvider';
import { cancelGeneration, rateAiResult, saveAiResult, subscribeToAiRequest, type AiRequestView } from '../../AiRepository';
import { trackGeneration } from '../../aiOutcomes';
import { clearPendingAiRequest } from '../../pendingAiRequest';

const mockRouter = { replace: jest.fn(), back: jest.fn() };
const mockParams = { requestId: 'req-1' };

jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => mockRouter, Redirect: () => null }));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
jest.mock('../../AiRepository', () => ({
  cancelGeneration: jest.fn(),
  rateAiResult: jest.fn(),
  saveAiResult: jest.fn(),
  subscribeToAiRequest: jest.fn(),
}));
jest.mock('../../pendingAiRequest', () => ({ clearPendingAiRequest: jest.fn() }));

const item = (name: string, extra: Record<string, unknown> = {}) => ({
  name, quantity: null, unit: null, category: null, reason: null, priority: 'essential' as const, ...extra,
});
const result = (overrides: Partial<AiResult> = {}): AiResult => ({
  title: '日帰り登山', listType: 'packing', category: null, safetyNotice: false,
  items: [item('水', { reason: '脱水を防ぐ' }), item('地図'), item('帽子', { priority: 'nice-to-have' })],
  ...overrides,
});
const view = (overrides: Partial<AiRequestView> = {}): AiRequestView => ({
  status: 'succeeded', result: result(), message: null, listId: null, rating: null, ...overrides,
});

function arrange(request: AiRequestView | null, { offline = false } = {}) {
  jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1', language: 'ja' } } as ReturnType<typeof useSession>);
  jest.mocked(useConnectivity).mockReturnValue({ isOffline: offline, isRetrying: false, retry: jest.fn() });
  jest.mocked(subscribeToAiRequest).mockImplementation((_uid, _id, onChange) => {
    onChange(request);
    return jest.fn();
  });
}

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('AiResultScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.requestId = 'req-1';
    jest.mocked(saveAiResult).mockResolvedValue({ status: 'saved', listId: 'list-9' });
    jest.mocked(cancelGeneration).mockResolvedValue({ status: 'cancelled' });
    jest.mocked(rateAiResult).mockResolvedValue({ ok: true });
  });

  describe('while generating', () => {
    it('shows the progress and lets the user cancel', async () => {
      arrange(view({ status: 'reserved', result: null }));
      const { getByText, getByRole } = await render(<AiResultScreen />);

      expect(getByText('生成しています。しばらくお待ちください')).toBeTruthy();
      await fireEvent.press(getByRole('button', { name: 'キャンセル' }));

      expect(cancelGeneration).toHaveBeenCalledWith({ requestId: 'req-1' });
      expect(clearPendingAiRequest).toHaveBeenCalled();
    });
  });

  describe('a finished result (also what comes back after the app is reopened)', () => {
    it('shows the result with the AI notice, and no safety notice unless the result asks for it', async () => {
      arrange(view());
      const { getByLabelText, getByText, queryByText } = await render(<AiResultScreen />);

      expect(getByLabelText('リスト名').props.value).toBe('日帰り登山');
      expect(getByText('AIが作成した内容です。実際の状況に合わせて、必ず内容を確認してください')).toBeTruthy();
      expect(queryByText(/専門機関の最新情報/)).toBeNull();
      expect(getByText('脱水を防ぐ')).toBeTruthy();
      expect(getByText('選択中 3/3件')).toBeTruthy();
    });

    it('shows the safety notice for a hiking or disaster result', async () => {
      arrange(view({ result: result({ safetyNotice: true }) }));
      const { getByText } = await render(<AiResultScreen />);

      expect(getByText('登山・防災・医療などは、専門機関の最新情報を確認してください。この内容は安全を保証するものではありません')).toBeTruthy();
    });

    it('saves only the selected items after editing, with the new title and list type', async () => {
      arrange(view());
      const { getByRole, getByLabelText } = await render(<AiResultScreen />);

      await fireEvent.press(getByRole('checkbox', { name: '地図' }));
      await fireEvent.changeText(getByLabelText('水の名前'), '水(2L)');
      await fireEvent.changeText(getByLabelText('リスト名'), '家族の登山');
      await fireEvent.press(getByRole('button', { name: '買い物' }));
      await fireEvent.press(getByRole('button', { name: '保存する' }));
      await flush();

      expect(saveAiResult).toHaveBeenCalledTimes(1);
      const request = jest.mocked(saveAiResult).mock.calls[0][0];
      expect(request).toMatchObject({ requestId: 'req-1', title: '家族の登山', listType: 'shopping' });
      expect(request.items.map((i) => i.name)).toEqual(['水(2L)', '帽子']);
      expect(clearPendingAiRequest).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith('/list/list-9');
    });

    it('adds and deletes items', async () => {
      arrange(view());
      const { getByRole, getByLabelText, queryByLabelText, getByText } = await render(<AiResultScreen />);

      await fireEvent.changeText(getByLabelText('追加する項目'), 'ナイフ');
      await fireEvent.press(getByRole('button', { name: '追加' }));
      expect(getByLabelText('ナイフの名前')).toBeTruthy();
      expect(getByText('選択中 4/4件')).toBeTruthy();

      await fireEvent.press(getByRole('button', { name: '地図を削除' }));
      expect(queryByLabelText('地図の名前')).toBeNull();
      expect(getByText('選択中 3/3件')).toBeTruthy();
    });

    it('cannot be saved with nothing selected', async () => {
      arrange(view({ result: result({ items: [item('水')] }) }));
      const { getByRole } = await render(<AiResultScreen />);

      await fireEvent.press(getByRole('checkbox', { name: '水' }));

      expect(getByRole('button', { name: '保存する' })).toBeDisabled();
    });

    it('keeps the result and explains when the list limit is reached', async () => {
      arrange(view());
      jest.mocked(saveAiResult).mockResolvedValue({ status: 'limit-reached' });
      const { getByRole, findByText, getByLabelText } = await render(<AiResultScreen />);

      await fireEvent.press(getByRole('button', { name: '保存する' }));

      expect(await findByText('Freeプランで利用できるリストは3件までです。既存のリストをアーカイブしてから、もう一度保存してください')).toBeTruthy();
      expect(getByLabelText('リスト名').props.value).toBe('日帰り登山');
      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(clearPendingAiRequest).not.toHaveBeenCalled();
    });

    it('disables saving while offline and says why', async () => {
      arrange(view(), { offline: true });
      const { getByRole, getByText } = await render(<AiResultScreen />);

      expect(getByText('オフラインのため使えません。オンライン接続が必要です')).toBeTruthy();
      expect(getByRole('button', { name: '保存する' })).toBeDisabled();
    });

    it('records a rating, and shows one given earlier', async () => {
      arrange(view({ rating: 'insufficient' }));
      const { getByRole } = await render(<AiResultScreen />);

      expect(getByRole('button', { name: '足りなかった' }).props.accessibilityState.selected).toBe(true);
      await fireEvent.press(getByRole('button', { name: '役に立った' }));

      expect(rateAiResult).toHaveBeenCalledWith({ requestId: 'req-1', rating: 'helpful' });
    });

    it('can be discarded without saving', async () => {
      arrange(view());
      const { getByRole } = await render(<AiResultScreen />);

      await fireEvent.press(getByRole('button', { name: '破棄して戻る' }));

      expect(clearPendingAiRequest).toHaveBeenCalled();
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('offers to open the list once it has been saved', async () => {
      arrange(view({ status: 'saved', listId: 'list-1' }));
      const { getByRole, getByText } = await render(<AiResultScreen />);

      expect(getByText('保存しました')).toBeTruthy();
      await fireEvent.press(getByRole('button', { name: 'リストを開く' }));
      expect(mockRouter.replace).toHaveBeenCalledWith('/list/list-1');
    });
  });

  describe('when the generation did not produce a result', () => {
    it.each([
      ['failed', '生成に失敗しました'],
      ['refused', 'この内容ではリストを作成できません'],
      ['cancelled', '生成をキャンセルしました'],
    ] as const)('explains a %s request and lets the user fix the conditions', async (status, message) => {
      arrange(view({ status, result: null, message: status === 'cancelled' ? null : message }));
      const { getByText, getByRole } = await render(<AiResultScreen />);

      expect(getByText(message)).toBeTruthy();
      await fireEvent.press(getByRole('button', { name: '条件を直してやり直す' }));

      expect(clearPendingAiRequest).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith('/ai-flow');
    });

    it('explains a limit answered by the call itself (no request document exists)', async () => {
      mockParams.requestId = 'req-limit';
      arrange(null);
      trackGeneration('req-limit', Promise.resolve({ status: 'limit-reached', quota: { plan: 'free', used: 1, limit: 1, remaining: 0, resetsAt: null } }));
      const { findByText } = await render(<AiResultScreen />);

      expect(await findByText('無料の生成(1回)は使用済みです')).toBeTruthy();
    });

    it('explains a call that failed before reaching the server', async () => {
      mockParams.requestId = 'req-error';
      arrange(null);
      trackGeneration('req-error', Promise.reject({ code: 'resource-exhausted' }));
      const { findByText } = await render(<AiResultScreen />);

      expect(await findByText('操作が多すぎます。しばらくしてからもう一度お試しください')).toBeTruthy();
    });

    it('shows a waiting state until the request appears', async () => {
      mockParams.requestId = 'req-wait';
      arrange(null);
      const { getByText } = await render(<AiResultScreen />);

      expect(getByText('生成を準備しています')).toBeTruthy();
    });
  });
});
