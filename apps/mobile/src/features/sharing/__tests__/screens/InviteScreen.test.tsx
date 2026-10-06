import { fireEvent, render, waitFor } from '@testing-library/react-native';

import InviteScreen from '../../../../app/invite/[token]';
import { useSession } from '../../../session/SessionProvider';
import { savePendingInviteToken } from '../../../session/pending-invite';
import { acceptInvite, previewInvite } from '../../ShareRepository';

const TOKEN = 'a'.repeat(64);
const mockRouter = { replace: jest.fn() };
let mockParams: { token: string } = { token: TOKEN };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'request-id-1', getRandomBytes: jest.fn() }));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../../session/pending-invite', () => ({ savePendingInviteToken: jest.fn() }));
jest.mock('../../ShareRepository', () => ({ previewInvite: jest.fn(), acceptInvite: jest.fn() }));

const validPreview = {
  status: 'valid' as const,
  listName: '週末のキャンプ',
  inviterName: 'たろう',
  memberCount: 2,
  expiresAt: 1,
};

function signedIn(status: 'authenticated' | 'unauthenticated' | 'needsProfile') {
  jest.mocked(useSession).mockReturnValue({ status } as ReturnType<typeof useSession>);
}

describe('InviteScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { token: TOKEN };
    jest.mocked(previewInvite).mockResolvedValue(validPreview);
    jest.mocked(savePendingInviteToken).mockResolvedValue(undefined);
  });

  it('shows the preview (list name, inviter, member count) to a signed-out visitor', async () => {
    signedIn('unauthenticated');
    const { findByText, getByText } = await render(<InviteScreen />);

    expect(await findByText('週末のキャンプ')).toBeTruthy();
    expect(getByText('たろうさんから招待されています')).toBeTruthy();
    expect(getByText('現在のメンバー 2人')).toBeTruthy();
    expect(previewInvite).toHaveBeenCalledWith(TOKEN);
  });

  it('keeps the token and sends a signed-out visitor to sign in', async () => {
    signedIn('unauthenticated');
    const { findByRole } = await render(<InviteScreen />);

    await fireEvent.press(await findByRole('button', { name: 'ログインして参加' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/login'));
    expect(savePendingInviteToken).toHaveBeenCalledWith(TOKEN);
  });

  it('sends a visitor who still has to create a profile to the profile step', async () => {
    signedIn('needsProfile');
    const { findByRole } = await render(<InviteScreen />);

    await fireEvent.press(await findByRole('button', { name: 'ログインして参加' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/profile-setup'));
    expect(savePendingInviteToken).toHaveBeenCalledWith(TOKEN);
  });

  it('never calls accept for a signed-out visitor', async () => {
    signedIn('unauthenticated');
    const { findByText } = await render(<InviteScreen />);
    await findByText('週末のキャンプ');

    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('joins and opens the list when a signed-in user accepts', async () => {
    signedIn('authenticated');
    jest.mocked(acceptInvite).mockResolvedValue({ status: 'joined', listId: 'list-1' });
    const { findByRole } = await render(<InviteScreen />);

    await fireEvent.press(await findByRole('button', { name: '参加する' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/list/list-1'));
    expect(acceptInvite).toHaveBeenCalledWith(TOKEN, 'request-id-1');
  });

  it('opens the list when the user had already joined', async () => {
    signedIn('authenticated');
    jest.mocked(acceptInvite).mockResolvedValue({ status: 'already-member', listId: 'list-9' });
    const { findByRole } = await render(<InviteScreen />);

    await fireEvent.press(await findByRole('button', { name: '参加する' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/list/list-9'));
  });

  it('keeps the preview and offers to archive an existing list when the Free limit is reached', async () => {
    signedIn('authenticated');
    jest.mocked(acceptInvite).mockResolvedValue({ status: 'limit-reached' });
    const { findByRole, findByText, getByText, queryByRole } = await render(<InviteScreen />);

    await fireEvent.press(await findByRole('button', { name: '参加する' }));

    expect(await findByText(/Freeプランのリスト上限に達しています/)).toBeTruthy();
    expect(getByText('週末のキャンプ')).toBeTruthy();
    expect(queryByRole('button', { name: '参加する' })).toBeNull();
    await fireEvent.press(getByText('既存リストをアーカイブ'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('explains an own invite instead of joining', async () => {
    signedIn('authenticated');
    jest.mocked(acceptInvite).mockResolvedValue({ status: 'own-invite' });
    const { findByRole, findByText } = await render(<InviteScreen />);

    await fireEvent.press(await findByRole('button', { name: '参加する' }));

    expect(await findByText(/自分が作成した招待です/)).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('shows the server error when accepting fails, without navigating away', async () => {
    signedIn('authenticated');
    jest.mocked(acceptInvite).mockRejectedValue({ code: 'unavailable', message: 'raw' });
    const { findByRole, findByText } = await render(<InviteScreen />);

    await fireEvent.press(await findByRole('button', { name: '参加する' }));

    expect(await findByText(/オンライン/)).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', '招待の有効期限が切れています'],
    ['revoked', 'この招待は取り消されました'],
    ['used', 'この招待は既に使用されました'],
    ['list-deleted', 'このリストは削除されました'],
    ['not-found', '招待が見つかりません'],
  ] as const)('shows %s as a problem instead of the preview', async (status, title) => {
    signedIn('authenticated');
    jest.mocked(previewInvite).mockResolvedValue({ status });
    const { findByText, queryByRole } = await render(<InviteScreen />);

    expect(await findByText(title)).toBeTruthy();
    expect(queryByRole('button', { name: '参加する' })).toBeNull();
  });

  it('does not even ask the server about a malformed token', async () => {
    signedIn('authenticated');
    mockParams = { token: 'not-a-token' };
    const { findByText } = await render(<InviteScreen />);

    expect(await findByText('招待が見つかりません')).toBeTruthy();
    expect(previewInvite).not.toHaveBeenCalled();
  });

  it('offers a retry when the preview cannot be loaded (offline)', async () => {
    signedIn('authenticated');
    jest.mocked(previewInvite).mockRejectedValueOnce(new Error('offline'));
    const { findByText, findByRole } = await render(<InviteScreen />);

    expect(await findByText('招待を確認できませんでした')).toBeTruthy();
    await fireEvent.press(await findByRole('button', { name: '再試行' }));

    expect(await findByText('週末のキャンプ')).toBeTruthy();
    expect(previewInvite).toHaveBeenCalledTimes(2);
  });

  it('saves the token as soon as a signed-out visitor opens the link, even if the preview cannot load', async () => {
    signedIn('unauthenticated');
    jest.mocked(previewInvite).mockRejectedValue(new Error('offline'));
    const { findByText } = await render(<InviteScreen />);

    expect(await findByText('招待を確認できませんでした')).toBeTruthy();
    expect(savePendingInviteToken).toHaveBeenCalledWith(TOKEN);
  });

  it('does not save a token for a signed-in user (nothing to resume)', async () => {
    signedIn('authenticated');
    const { findByText } = await render(<InviteScreen />);
    await findByText('週末のキャンプ');

    expect(savePendingInviteToken).not.toHaveBeenCalled();
  });

  it('does not save a malformed token', async () => {
    signedIn('unauthenticated');
    mockParams = { token: 'not-a-token' };
    const { findByText } = await render(<InviteScreen />);
    await findByText('招待が見つかりません');

    expect(savePendingInviteToken).not.toHaveBeenCalled();
  });

  describe('leaving the screen', () => {
    it.each([
      ['unauthenticated', '/login'],
      ['needsProfile', '/profile-setup'],
      ['authenticated', '/'],
    ] as const)('goes to the right place for a %s user (%s), never to a protected route', async (status, destination) => {
      signedIn(status);
      jest.mocked(previewInvite).mockResolvedValue({ status: 'expired' });
      const { findByRole } = await render(<InviteScreen />);

      await fireEvent.press(await findByRole('button', { name: '閉じる' }));

      expect(mockRouter.replace).toHaveBeenCalledWith(destination);
    });
  });
});
