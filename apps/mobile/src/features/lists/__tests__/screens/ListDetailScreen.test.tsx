import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import type { List, ListMember } from '@soroe/shared';

import ListDetailScreen from '../../../../app/list/[listId]';
import { useSession } from '../../../session/SessionProvider';
import { subscribeToList, subscribeToListItems, subscribeToListMembers } from '../../ListRepository';

const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ listId: 'list-1' }),
  useRouter: () => mockRouter,
  Redirect: () => null,
  // ヘッダー右のメニューボタンを描画させ、メニューの出し分けを検証できるようにする。
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../ListRepository', () => ({
  subscribeToList: jest.fn(),
  subscribeToListItems: jest.fn(),
  subscribeToListMembers: jest.fn(),
  addListItem: jest.fn(),
  archiveList: jest.fn(),
  deleteList: jest.fn(),
  duplicateList: jest.fn(),
  reorderListItem: jest.fn(),
  setListItemCompletion: jest.fn(),
}));

const OWNER = 'owner-uid';
const EDITOR = 'editor-uid';

const list: List = {
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
  { uid: OWNER, listId: 'list-1', role: 'owner', joinedAt: 1, displayName: 'たろう' },
  { uid: EDITOR, listId: 'list-1', role: 'editor', joinedAt: 2, displayName: 'はなこ' },
];

const denied = { code: 'firestore/permission-denied' } as unknown as Error;
const unavailable = { code: 'firestore/unavailable' } as unknown as Error;

type Failure = { list?: Error; items?: Error; members?: Error };

function arrange({ asUid = OWNER, current = list, failure = {} }: { asUid?: string; current?: List; failure?: Failure } = {}) {
  jest.mocked(useSession).mockReturnValue({ profile: { uid: asUid } } as ReturnType<typeof useSession>);
  jest.mocked(subscribeToList).mockImplementation((_id, onChange, onError) => {
    if (failure.list) onError(failure.list);
    else onChange(current);
    return jest.fn();
  });
  jest.mocked(subscribeToListItems).mockImplementation((_id, onChange, onError) => {
    if (failure.items) onError(failure.items);
    else onChange({ items: [], hasPendingWrites: false, isFromCache: false });
    return jest.fn();
  });
  jest.mocked(subscribeToListMembers).mockImplementation((_id, onChange, onError) => {
    if (failure.members) onError(failure.members);
    else onChange(members);
    return jest.fn();
  });
}

function menuButtons(): AlertButton[] {
  const calls = jest.mocked(Alert.alert).mock.calls;
  return calls[calls.length - 1][2] as AlertButton[];
}

describe('ListDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  describe('when the signed-in user loses access (removed or left while viewing)', () => {
    it.each([
      ['members', { members: denied }],
      ['list', { list: denied }],
      ['items', { items: denied }],
    ] as const)('shows that access was lost when the %s subscription is denied', async (_source, failure) => {
      arrange({ asUid: EDITOR, failure });
      const { findByText, getByRole } = await render(<ListDetailScreen />);

      expect(await findByText('アクセスできなくなりました')).toBeTruthy();
      await fireEvent.press(getByRole('button', { name: 'リスト一覧へ' }));
      expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
    });

    it('keeps showing the list when the members subscription fails for another reason', async () => {
      arrange({ failure: { members: unavailable } });
      const { findByText, queryByText } = await render(<ListDetailScreen />);

      expect(await findByText('項目がありません')).toBeTruthy();
      expect(queryByText('アクセスできなくなりました')).toBeNull();
    });

    it('shows a plain load error (not an access message) for other list failures', async () => {
      arrange({ failure: { list: unavailable } });
      const { findByText, queryByText } = await render(<ListDetailScreen />);

      expect(await findByText('読み込みに失敗しました')).toBeTruthy();
      expect(queryByText('アクセスできなくなりました')).toBeNull();
    });
  });

  describe('list menu (permissions per spec 2.3)', () => {
    it('gives the owner every action', async () => {
      arrange();
      const { findByRole } = await render(<ListDetailScreen />);

      await fireEvent.press(await findByRole('button', { name: 'メニュー' }));

      expect(menuButtons().map((button) => button.text)).toEqual([
        'リストを編集',
        '複製する',
        '共有・メンバー',
        'アーカイブする',
        '削除する',
        'キャンセル',
      ]);
    });

    it('lets an editor edit the list and see members, but not archive or delete', async () => {
      arrange({ asUid: EDITOR });
      const { findByRole } = await render(<ListDetailScreen />);

      await fireEvent.press(await findByRole('button', { name: 'メニュー' }));

      const texts = menuButtons().map((button) => button.text);
      expect(texts).toContain('リストを編集');
      expect(texts).toContain('共有・メンバー');
      expect(texts).toContain('複製する');
      expect(texts).not.toContain('アーカイブする');
      expect(texts).not.toContain('削除する');
    });

    it('is read-only for an archived list: no edit, still shows members', async () => {
      arrange({ current: { ...list, archivedAt: 5 } });
      const { findByRole } = await render(<ListDetailScreen />);

      await fireEvent.press(await findByRole('button', { name: 'メニュー' }));

      const texts = menuButtons().map((button) => button.text);
      expect(texts).not.toContain('リストを編集');
      expect(texts).not.toContain('アーカイブする');
      expect(texts).toContain('共有・メンバー');
    });

    it('opens the share/members screen for the list', async () => {
      arrange({ asUid: EDITOR });
      const { findByRole } = await render(<ListDetailScreen />);
      await fireEvent.press(await findByRole('button', { name: 'メニュー' }));

      await act(async () => {
        menuButtons().find((button) => button.text === '共有・メンバー')!.onPress!();
      });

      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/list-share', params: { listId: 'list-1' } });
    });
  });
});
