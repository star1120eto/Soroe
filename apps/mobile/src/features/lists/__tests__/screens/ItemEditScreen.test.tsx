import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import type { List, ListItem } from '@soroe/shared';

import ItemEditScreen from '../../../../app/item-edit';
import { useSession } from '../../../session/SessionProvider';
import {
  addListItem,
  setListItemCompletion,
  softDeleteListItem,
  subscribeToList,
  subscribeToListItem,
  subscribeToListMembers,
  updateListItem,
} from '../../ListRepository';

const mockRouter = { back: jest.fn() };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ listId: 'list-1', itemId: 'item-1' }),
  useRouter: () => mockRouter,
  Redirect: () => null,
}));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../ListRepository', () => ({
  addListItem: jest.fn(),
  setListItemCompletion: jest.fn(),
  softDeleteListItem: jest.fn(),
  subscribeToList: jest.fn(),
  subscribeToListItem: jest.fn(),
  subscribeToListMembers: jest.fn(),
  updateListItem: jest.fn(),
}));

const list: List = {
  id: 'list-1',
  name: '週末のキャンプ',
  type: 'packing',
  color: 'primary',
  icon: 'suitcase',
  ownerId: 'uid-1',
  createdBy: 'uid-1',
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
  deletedAt: null,
};

function makeItem(overrides: Partial<ListItem> = {}): ListItem {
  return {
    id: 'item-1',
    listId: 'list-1',
    name: '寝袋',
    quantity: null,
    unit: null,
    category: null,
    note: null,
    assigneeId: null,
    dueAt: null,
    completedAt: null,
    completedBy: null,
    sortOrder: 1000,
    createdBy: 'uid-1',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

let emitItem: (item: ListItem | null) => void;

function arrange(initial: ListItem = makeItem()) {
  jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1' } } as ReturnType<typeof useSession>);
  jest.mocked(subscribeToList).mockImplementation((_id, onChange) => {
    onChange(list);
    return jest.fn();
  });
  jest.mocked(subscribeToListMembers).mockImplementation((_id, onChange) => {
    onChange([]);
    return jest.fn();
  });
  jest.mocked(subscribeToListItem).mockImplementation((_l, _i, onChange) => {
    emitItem = onChange;
    onChange(initial);
    return jest.fn();
  });
}

function alertButtons(): AlertButton[] {
  const calls = jest.mocked(Alert.alert).mock.calls;
  return calls[calls.length - 1][2] as AlertButton[];
}

describe('ItemEditScreen saving (SYNC-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('writes nothing and just closes when nothing was changed', async () => {
    arrange();
    const { getByRole } = await render(<ItemEditScreen />);

    await fireEvent.press(getByRole('button', { name: '保存する' }));

    expect(updateListItem).not.toHaveBeenCalled();
    expect(setListItemCompletion).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('saves only the changed field, without asking, when someone else changed a different field', async () => {
    arrange();
    const { getByRole, getByLabelText } = await render(<ItemEditScreen />);

    await fireEvent.changeText(getByLabelText('メモ'), 'ダウン');
    await act(async () => emitItem(makeItem({ name: '豆乳', updatedAt: 2 })));
    await fireEvent.press(getByRole('button', { name: '保存する' }));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(updateListItem).toHaveBeenCalledWith('list-1', 'item-1', { note: 'ダウン' });
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('shows both values when the same field was changed differently, and overwrites on request', async () => {
    arrange();
    const { getByRole, getByLabelText } = await render(<ItemEditScreen />);

    await fireEvent.changeText(getByLabelText('項目名'), 'マット');
    await act(async () => emitItem(makeItem({ name: '枕', updatedAt: 2 })));
    await fireEvent.press(getByRole('button', { name: '保存する' }));

    const calls = jest.mocked(Alert.alert).mock.calls;
    expect(calls[0][0]).toBe('他のメンバーが更新しました');
    expect(calls[0][1]).toBe('項目名: あなた「マット」/相手「枕」');
    expect(alertButtons().map((button) => button.text)).toEqual(['相手の変更を使う', '自分の変更で上書き']);

    await act(async () => alertButtons()[1].onPress?.());
    expect(updateListItem).toHaveBeenCalledWith('list-1', 'item-1', { name: 'マット' });
  });

  it('takes the other side value and stays on the screen when asked to use theirs', async () => {
    arrange();
    const { getByRole, getByLabelText } = await render(<ItemEditScreen />);

    await fireEvent.changeText(getByLabelText('項目名'), 'マット');
    await act(async () => emitItem(makeItem({ name: '枕', updatedAt: 2 })));
    await fireEvent.press(getByRole('button', { name: '保存する' }));
    await act(async () => alertButtons()[0].onPress?.());

    expect(getByLabelText('項目名').props.value).toBe('枕');
    expect(updateListItem).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe('ItemEditScreen when the item is deleted while editing (delete wins)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('stops saving, says it was deleted, and offers the typed content as a new item', async () => {
    arrange();
    const { getByText, getByLabelText, queryByRole, getByRole } = await render(<ItemEditScreen />);

    await fireEvent.changeText(getByLabelText('項目名'), 'マット');
    await act(async () => emitItem(null));

    expect(getByText('この項目は削除されました')).toBeTruthy();
    expect(queryByRole('button', { name: '保存する' })).toBeNull();

    await fireEvent.press(getByRole('button', { name: '入力内容を新しい項目として追加' }));
    expect(addListItem).toHaveBeenCalledWith('list-1', 'uid-1', expect.objectContaining({ name: 'マット' }), expect.any(Number));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('does not show the deleted screen when the user deletes the item themselves', async () => {
    arrange();
    const { getByRole, queryByText } = await render(<ItemEditScreen />);

    await fireEvent.press(getByRole('button', { name: 'この項目を削除' }));
    const confirm = jest.mocked(Alert.alert).mock.calls[0][2] as AlertButton[];
    await act(async () => {
      confirm.find((button) => button.text === '削除する')!.onPress?.();
      emitItem(null);
    });

    expect(softDeleteListItem).toHaveBeenCalledWith('list-1', 'item-1');
    expect(queryByText('この項目は削除されました')).toBeNull();
  });
});
