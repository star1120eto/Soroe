import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Share, type AlertButton } from 'react-native';
import type { List, ListMember } from '@soroe/shared';

import ListShareScreen from '../../../../app/list-share';
import { subscribeToList, subscribeToListMembers } from '../../../lists/ListRepository';
import { useSession } from '../../../session/SessionProvider';
import {
  createInvite,
  leaveList,
  removeMember,
  revokeInvite,
  subscribeToActiveInvites,
  transferOwnership,
  type ActiveInvite,
} from '../../ShareRepository';

const mockRouter = { dismissTo: jest.fn() };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ listId: 'list-1' }),
  useRouter: () => mockRouter,
  Redirect: () => null,
}));
jest.mock('expo-crypto', () => ({ getRandomBytes: () => new Uint8Array(32).fill(0xab), randomUUID: () => 'uuid' }));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../../lists/ListRepository', () => ({ subscribeToList: jest.fn(), subscribeToListMembers: jest.fn() }));
jest.mock('../../ShareRepository', () => ({
  createInvite: jest.fn(),
  leaveList: jest.fn(),
  removeMember: jest.fn(),
  revokeInvite: jest.fn(),
  subscribeToActiveInvites: jest.fn(),
  transferOwnership: jest.fn(),
}));

const OWNER = 'owner-uid';
const EDITOR = 'editor-uid';

const baseList: List = {
  id: 'list-1',
  name: '週末のキャンプ',
  type: 'packing',
  color: 'primary',
  icon: 'suitcase',
  ownerId: OWNER,
  createdBy: OWNER,
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
  deletedAt: null,
};

const members: ListMember[] = [
  { uid: EDITOR, listId: 'list-1', role: 'editor', joinedAt: 20, displayName: 'はなこ' },
  { uid: OWNER, listId: 'list-1', role: 'owner', joinedAt: 10, displayName: 'たろう' },
];

function arrange({
  asUid = OWNER,
  list = baseList,
  invites = [],
  membersError,
}: {
  asUid?: string;
  list?: List;
  invites?: ActiveInvite[];
  membersError?: { code: string };
} = {}) {
  jest.mocked(useSession).mockReturnValue({ profile: { uid: asUid } } as ReturnType<typeof useSession>);
  jest.mocked(subscribeToList).mockImplementation((_id, onChange) => {
    onChange(list);
    return jest.fn();
  });
  jest.mocked(subscribeToListMembers).mockImplementation((_id, onChange, onError) => {
    if (membersError) {
      onError(membersError as unknown as Error);
    } else {
      onChange(members);
    }
    return jest.fn();
  });
  jest.mocked(subscribeToActiveInvites).mockImplementation((_id, onChange) => {
    onChange(invites);
    return jest.fn();
  });
}

function lastAlertButtons(): AlertButton[] {
  const calls = jest.mocked(Alert.alert).mock.calls;
  return calls[calls.length - 1][2] as AlertButton[];
}

// Alertのボタンは画面の外(OS)から呼ばれるため、actで包んで状態更新を反映させる。
async function pressAlertButton(text: string) {
  const button = lastAlertButtons().find((candidate) => candidate.text === text)!;
  await act(async () => {
    button.onPress!();
  });
}

describe('ListShareScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    jest.mocked(createInvite).mockResolvedValue({ inviteId: 'hash', expiresAt: 1 });
    jest.mocked(leaveList).mockResolvedValue({ ok: true });
    jest.mocked(removeMember).mockResolvedValue({ ok: true });
    jest.mocked(revokeInvite).mockResolvedValue({ ok: true });
    jest.mocked(transferOwnership).mockResolvedValue({ ok: true });
  });

  describe('as the owner', () => {
    it('lists the members with the owner first and marks the signed-in user', async () => {
      arrange();
      const { getByText, getAllByText } = await render(<ListShareScreen />);

      expect(getByText('メンバー(2人)')).toBeTruthy();
      expect(getByText('たろう(自分)')).toBeTruthy();
      expect(getByText('はなこ')).toBeTruthy();
      expect(getAllByText('オーナー')).toHaveLength(1);
      expect(getAllByText('編集者')).toHaveLength(1);
    });

    it('offers management only for other members, and no leave button', async () => {
      arrange();
      const { getAllByRole, queryByRole } = await render(<ListShareScreen />);

      // 同じ文言の「管理」が並ぶと支援技術がどのメンバーか区別できないため、名前を含める。
      expect(getAllByRole('button', { name: 'はなこを管理' })).toHaveLength(1);
      expect(queryByRole('button', { name: /たろう.*を管理/ })).toBeNull();
      expect(queryByRole('button', { name: 'リストから退出' })).toBeNull();
    });

    it('creates an invite with a fresh 256-bit token and opens the OS share sheet with the link', async () => {
      arrange();
      const { getByRole } = await render(<ListShareScreen />);

      await fireEvent.press(getByRole('button', { name: '招待リンクを発行して共有' }));

      const token = 'ab'.repeat(32);
      await waitFor(() => expect(Share.share).toHaveBeenCalled());
      expect(createInvite).toHaveBeenCalledWith({ listId: 'list-1', token });
      const { message } = jest.mocked(Share.share).mock.calls[0][0];
      expect(message).toContain('週末のキャンプ');
      expect(message).toContain(`https://soroe.app/invite/${token}`);
    });

    it('does not open the share sheet when creating the invite fails', async () => {
      arrange();
      jest.mocked(createInvite).mockRejectedValue({ code: 'permission-denied', message: 'オーナーだけが招待を作成できます' });
      const { getByRole, findByText } = await render(<ListShareScreen />);

      await fireEvent.press(getByRole('button', { name: '招待リンクを発行して共有' }));

      expect(await findByText('オーナーだけが招待を作成できます')).toBeTruthy();
      expect(Share.share).not.toHaveBeenCalled();
    });

    it('lists each outstanding single-use link with its expiry and its own cancel button', async () => {
      const day = 24 * 60 * 60 * 1000;
      arrange({
        invites: [
          { inviteId: 'hash-b', expiresAt: Date.now() + 5 * day },
          { inviteId: 'hash-a', expiresAt: Date.now() + 3 * day },
        ],
      });
      const { getByText, getByRole } = await render(<ListShareScreen />);

      // 期限が近い順に番号を振り、取消ボタンはどのリンクか区別できる名前にする。
      expect(getByText('招待リンク1(未使用)')).toBeTruthy();
      expect(getByText(/あと3日/)).toBeTruthy();
      expect(getByText('招待リンク2(未使用)')).toBeTruthy();
      expect(getByText(/あと5日/)).toBeTruthy();
      expect(getByRole('button', { name: 'リンク1を取消' })).toBeTruthy();
      expect(getByRole('button', { name: 'リンク2を取消' })).toBeTruthy();
    });

    it('shows a freshly issued link as 7 days even when the screen was opened a while ago', async () => {
      const MINUTE = 60 * 1000;
      const DAY = 24 * 60 * MINUTE;
      const openedAt = new Date(2026, 9, 7, 9, 0).getTime();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(openedAt);
      arrange();
      let deliverInvites: (invites: ActiveInvite[]) => void = () => {};
      jest.mocked(subscribeToActiveInvites).mockImplementation((_id, onChange) => {
        deliverInvites = onChange;
        onChange([]);
        return jest.fn();
      });
      const { findByText } = await render(<ListShareScreen />);

      // 画面を開いてから1時間後に発行したリンクは、画面を開いた時刻を基準にすると
      // 残り7日と1時間になり「あと8日」と切り上がってしまう。
      const issuedAt = openedAt + 60 * MINUTE;
      nowSpy.mockReturnValue(issuedAt);
      await act(async () => {
        deliverInvites([{ inviteId: 'fresh', expiresAt: issuedAt + 7 * DAY }]);
      });

      expect(await findByText(/あと7日/)).toBeTruthy();
      nowSpy.mockRestore();
    });

    it('explains that a link is for one person and each person needs their own', async () => {
      arrange();
      const { getByText } = await render(<ListShareScreen />);

      expect(getByText(/1人用/)).toBeTruthy();
      expect(getByText(/人ごとにリンクを発行/)).toBeTruthy();
      expect(getByText(/7日間/)).toBeTruthy();
    });

    it('issues a new link without touching the outstanding ones', async () => {
      arrange({ invites: [{ inviteId: 'hash-a', expiresAt: Date.now() + 1000 * 60 * 60 }] });
      const { getByRole } = await render(<ListShareScreen />);

      await fireEvent.press(getByRole('button', { name: '招待リンクを発行して共有' }));

      await waitFor(() => expect(Share.share).toHaveBeenCalled());
      expect(createInvite).toHaveBeenCalledTimes(1);
      expect(revokeInvite).not.toHaveBeenCalled();
    });

    it('shows the server message when the cap of outstanding links is reached', async () => {
      arrange();
      jest.mocked(createInvite).mockRejectedValue({
        code: 'failed-precondition',
        message: '有効な招待リンクが上限に達しています。使わないリンクを取り消してください',
      });
      const { getByRole, findByText } = await render(<ListShareScreen />);

      await fireEvent.press(getByRole('button', { name: '招待リンクを発行して共有' }));

      expect(await findByText(/上限に達しています/)).toBeTruthy();
      expect(Share.share).not.toHaveBeenCalled();
    });

    it('ignores an invite that has already expired', async () => {
      arrange({ invites: [{ inviteId: 'hash', expiresAt: Date.now() - 1000 }] });
      const { queryByText, getByRole } = await render(<ListShareScreen />);

      expect(queryByText(/招待リンク1/)).toBeNull();
      expect(getByRole('button', { name: '招待リンクを発行して共有' })).toBeTruthy();
    });

    it('revokes an invite only after confirmation', async () => {
      arrange({ invites: [{ inviteId: 'hash', expiresAt: Date.now() + 1000 * 60 * 60 }] });
      const { getByRole } = await render(<ListShareScreen />);

      await fireEvent.press(getByRole('button', { name: 'リンク1を取消' }));
      expect(revokeInvite).not.toHaveBeenCalled();
      await pressAlertButton('取り消す');

      await waitFor(() => expect(revokeInvite).toHaveBeenCalledWith('hash'));
    });

    it('removes a member only after confirmation', async () => {
      arrange();
      const { getByRole } = await render(<ListShareScreen />);

      await fireEvent.press(getByRole('button', { name: 'はなこを管理' }));
      await pressAlertButton('メンバーから削除');
      expect(removeMember).not.toHaveBeenCalled();
      await pressAlertButton('削除する');

      await waitFor(() => expect(removeMember).toHaveBeenCalledWith('list-1', EDITOR));
    });

    it('warns that the owner becomes an editor before transferring ownership', async () => {
      arrange();
      const { getByRole } = await render(<ListShareScreen />);

      await fireEvent.press(getByRole('button', { name: 'はなこを管理' }));
      await pressAlertButton('オーナーにする');
      const [title, message] = jest.mocked(Alert.alert).mock.calls.at(-1)!;
      expect(title).toContain('はなこ');
      expect(message).toContain('編集者になり');
      expect(transferOwnership).not.toHaveBeenCalled();
      await pressAlertButton('オーナーを移す');

      await waitFor(() => expect(transferOwnership).toHaveBeenCalledWith('list-1', EDITOR));
    });

    it('explains that the owner cannot leave', async () => {
      arrange();
      const { getByText } = await render(<ListShareScreen />);

      expect(getByText(/オーナーは退出できません/)).toBeTruthy();
    });

    it('says invites need a connection', async () => {
      arrange();
      const { getByText } = await render(<ListShareScreen />);

      expect(getByText(/オンライン接続が必要/)).toBeTruthy();
    });

    it('does not offer invites for an archived list', async () => {
      arrange({ list: { ...baseList, archivedAt: 5 } });
      const { getByText, queryByRole } = await render(<ListShareScreen />);

      expect(getByText(/アーカイブ中のリストには招待できません/)).toBeTruthy();
      expect(queryByRole('button', { name: '招待リンクを発行して共有' })).toBeNull();
    });
  });

  describe('as an editor', () => {
    it('shows no invite or management controls, only leaving', async () => {
      arrange({ asUid: EDITOR });
      const { getByRole, queryByRole, queryByText } = await render(<ListShareScreen />);

      expect(getByRole('button', { name: 'リストから退出' })).toBeTruthy();
      expect(queryByRole('button', { name: '招待リンクを発行して共有' })).toBeNull();
      expect(queryByRole('button', { name: /を管理$/ })).toBeNull();
      expect(queryByText('家族を招待')).toBeNull();
      expect(subscribeToActiveInvites).not.toHaveBeenCalled();
    });

    it('leaves only after confirmation, then returns to the list index', async () => {
      arrange({ asUid: EDITOR });
      const { getByRole } = await render(<ListShareScreen />);

      await fireEvent.press(getByRole('button', { name: 'リストから退出' }));
      expect(leaveList).not.toHaveBeenCalled();
      await pressAlertButton('退出する');

      await waitFor(() => expect(leaveList).toHaveBeenCalledWith('list-1'));
      await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    });

    it('stays on the screen and shows the error when leaving fails', async () => {
      arrange({ asUid: EDITOR });
      jest.mocked(leaveList).mockRejectedValue({ code: 'unavailable' });
      const { getByRole, findByText } = await render(<ListShareScreen />);

      await fireEvent.press(getByRole('button', { name: 'リストから退出' }));
      await pressAlertButton('退出する');

      expect(await findByText(/オンライン/)).toBeTruthy();
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    });
  });

  it('shows that access was lost when the subscription is denied (removed while viewing)', async () => {
    arrange({ asUid: EDITOR, membersError: { code: 'firestore/permission-denied' } });
    const { findByText, getByRole } = await render(<ListShareScreen />);

    expect(await findByText('アクセスできなくなりました')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'リスト一覧へ' }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
  });

  it('shows a plain load error for other subscription failures', async () => {
    arrange({ membersError: { code: 'firestore/unavailable' } });
    const { findByText, queryByText } = await render(<ListShareScreen />);

    expect(await findByText('読み込みに失敗しました')).toBeTruthy();
    expect(queryByText('アクセスできなくなりました')).toBeNull();
  });
});
