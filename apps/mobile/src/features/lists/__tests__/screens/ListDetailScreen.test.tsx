import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import type { List, ListItem, ListMember } from '@soroe/shared';

import ListDetailScreen from '../../../../app/list/[listId]';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';
import { useSession } from '../../../session/SessionProvider';
import { archiveList, deleteList, duplicateList, setListItemCompletion, subscribeToList, subscribeToListItems, subscribeToListMembers } from '../../ListRepository';

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
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
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

function makeItem(id: string, name: string, completed = false): ListItem {
  return {
    id,
    listId: 'list-1',
    name,
    quantity: null,
    unit: null,
    category: null,
    note: null,
    assigneeId: null,
    dueAt: null,
    completedAt: completed ? 2 : null,
    completedBy: completed ? OWNER : null,
    sortOrder: 1000,
    createdBy: OWNER,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  };
}

function arrange({
  asUid = OWNER,
  current = list,
  failure = {},
  items = [],
  pendingCount = 0,
  offline = false,
}: { asUid?: string; current?: List; failure?: Failure; items?: ListItem[]; pendingCount?: number; offline?: boolean } = {}) {
  jest.mocked(useConnectivity).mockReturnValue({ isOffline: offline, isRetrying: false, retry: jest.fn() });
  jest.mocked(useSession).mockReturnValue({ profile: { uid: asUid } } as ReturnType<typeof useSession>);
  jest.mocked(subscribeToList).mockImplementation((_id, onChange, onError) => {
    if (failure.list) onError(failure.list);
    else onChange(current);
    return jest.fn();
  });
  jest.mocked(subscribeToListItems).mockImplementation((_id, onChange, onError) => {
    if (failure.items) onError(failure.items);
    else onChange({ items, hasPendingWrites: pendingCount > 0, pendingCount, isFromCache: false });
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
        'マイテンプレートに保存',
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
      expect(texts).toContain('マイテンプレートに保存');
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
      // 保存は元のリストを変えないため、アーカイブ中でも使える。
      expect(texts).toContain('マイテンプレートに保存');
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

  describe('item row (tap completes, long press opens edit/reorder)', () => {
    it('completes an incomplete item when its title is tapped, without opening the editor', async () => {
      arrange({ items: [makeItem('item-1', '寝袋')] });
      const { findByText } = await render(<ListDetailScreen />);

      await fireEvent.press(await findByText('寝袋'));

      expect(setListItemCompletion).toHaveBeenCalledWith('list-1', 'item-1', OWNER, true);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('reopens a completed item when its title is tapped', async () => {
      arrange({ items: [makeItem('item-1', '寝袋', true)] });
      const { findByText } = await render(<ListDetailScreen />);

      await fireEvent.press(await findByText('寝袋'));

      expect(setListItemCompletion).toHaveBeenCalledWith('list-1', 'item-1', OWNER, false);
    });

    it('offers edit and reorder on long press, and edit opens the item editor', async () => {
      arrange({ items: [makeItem('item-1', '寝袋')] });
      const { findByText } = await render(<ListDetailScreen />);

      await fireEvent(await findByText('寝袋'), 'longPress');

      expect(menuButtons().map((button) => button.text)).toEqual(['編集する', '並べ替える', 'キャンセル']);
      menuButtons()[0].onPress?.();
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/item-edit',
        params: { listId: 'list-1', itemId: 'item-1' },
      });
      expect(setListItemCompletion).not.toHaveBeenCalled();
    });

    it('does not complete or open a menu for items of an archived list', async () => {
      arrange({ current: { ...list, archivedAt: 5 }, items: [makeItem('item-1', '寝袋')] });
      const { findByText } = await render(<ListDetailScreen />);
      const title = await findByText('寝袋');

      await fireEvent.press(title);
      await fireEvent(title, 'longPress');

      expect(setListItemCompletion).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });

  describe('offline banner (OFF-001)', () => {
    it('shows the offline message and the pending count when offline', async () => {
      arrange({ offline: true, pendingCount: 2, items: [makeItem('item-1', '寝袋')] });
      const { findByText } = await render(<ListDetailScreen />);

      expect(await findByText('オフラインです。変更は端末に保存され、復帰後に自動で同期します')).toBeTruthy();
      expect(await findByText('未同期 2件')).toBeTruthy();
    });

    it('shows no banner when online with nothing pending', async () => {
      arrange({ items: [makeItem('item-1', '寝袋')] });
      const { findByText, queryByText } = await render(<ListDetailScreen />);

      await findByText('寝袋');
      expect(queryByText(/オフラインです/)).toBeNull();
      expect(queryByText(/同期中です/)).toBeNull();
    });
  });

  describe('list menu while offline (OFF-001)', () => {
    const OFFLINE_REASON = 'オフラインのため使えません。オンライン接続が必要です';

    it.each(['複製する', 'アーカイブする', '削除する'])(
      'explains instead of calling the server when "%s" is chosen offline',
      async (label) => {
        arrange({ offline: true });
        const { findByRole } = await render(<ListDetailScreen />);
        await fireEvent.press(await findByRole('button', { name: 'メニュー' }));

        menuButtons().find((button) => button.text === label)!.onPress?.();

        expect(Alert.alert).toHaveBeenLastCalledWith('オフラインです', OFFLINE_REASON);
        expect(duplicateList).not.toHaveBeenCalled();
        expect(archiveList).not.toHaveBeenCalled();
        expect(deleteList).not.toHaveBeenCalled();
      }
    );

    it('still opens the offline-capable actions', async () => {
      arrange({ offline: true });
      const { findByRole } = await render(<ListDetailScreen />);
      await fireEvent.press(await findByRole('button', { name: 'メニュー' }));

      menuButtons().find((button) => button.text === '共有・メンバー')!.onPress?.();

      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/list-share', params: { listId: 'list-1' } });
    });
  });

  describe('save as a my-template (MYTM-02)', () => {
    it('opens the save screen for the list', async () => {
      arrange({ asUid: EDITOR });
      const { findByRole } = await render(<ListDetailScreen />);
      await fireEvent.press(await findByRole('button', { name: 'メニュー' }));

      await act(async () => {
        menuButtons().find((button) => button.text === 'マイテンプレートに保存')!.onPress!();
      });

      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/save-template', params: { listId: 'list-1' } });
    });

    it('explains instead of opening the screen while offline (saving needs the server)', async () => {
      arrange({ offline: true });
      const { findByRole } = await render(<ListDetailScreen />);
      await fireEvent.press(await findByRole('button', { name: 'メニュー' }));

      menuButtons().find((button) => button.text === 'マイテンプレートに保存')!.onPress?.();

      expect(Alert.alert).toHaveBeenLastCalledWith('オフラインです', 'オフラインのため使えません。オンライン接続が必要です');
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });
});
