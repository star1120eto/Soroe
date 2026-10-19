import { fireEvent, render } from '@testing-library/react-native';
import type { List } from '@soroe/shared';

import SaveTemplateScreen from '../../../../app/save-template';
import { subscribeToList } from '../../../lists/ListRepository';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';
import { useSession } from '../../../session/SessionProvider';
import { saveMyTemplate } from '../../TemplateRepository';

const mockRouter = { back: jest.fn(), dismissTo: jest.fn() };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ listId: 'list-1' }),
  useRouter: () => mockRouter,
  Redirect: () => null,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
jest.mock('../../../lists/ListRepository', () => ({ subscribeToList: jest.fn() }));
jest.mock('../../TemplateRepository', () => ({ saveMyTemplate: jest.fn() }));

const list: List = {
  id: 'list-1', name: '週末のキャンプ', type: 'packing', color: 'primary', icon: 'suitcase', ownerId: 'uid-1',
  createdBy: 'uid-1', createdAt: 1, updatedAt: 1, archivedAt: null, deletedAt: null,
};

function arrange(offline = false) {
  jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1', language: 'ja' } } as ReturnType<typeof useSession>);
  jest.mocked(useConnectivity).mockReturnValue({ isOffline: offline, isRetrying: false, retry: jest.fn() });
  jest.mocked(subscribeToList).mockImplementation((_id, onChange) => {
    onChange(list);
    return jest.fn();
  });
}

describe('SaveTemplateScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(saveMyTemplate).mockResolvedValue({ templateId: 't-1' });
  });

  it('starts with the list name as the title and saves with the typed description', async () => {
    arrange();
    const { getByLabelText, getByRole } = await render(<SaveTemplateScreen />);

    expect(getByLabelText('テンプレート名').props.value).toBe('週末のキャンプ');
    await fireEvent.changeText(getByLabelText('説明(任意)'), '家族用');
    await fireEvent.press(getByRole('button', { name: '保存する' }));

    expect(saveMyTemplate).toHaveBeenCalledWith({ listId: 'list-1', title: '週末のキャンプ', description: '家族用', requestId: 'uuid-1' });
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/templates');
  });

  it('sends no description when it is left empty', async () => {
    arrange();
    const { getByRole } = await render(<SaveTemplateScreen />);

    await fireEvent.press(getByRole('button', { name: '保存する' }));

    expect(saveMyTemplate).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });

  it('does not save with an empty title', async () => {
    arrange();
    const { getByLabelText, getByRole, findByText } = await render(<SaveTemplateScreen />);

    await fireEvent.changeText(getByLabelText('テンプレート名'), '   ');
    await fireEvent.press(getByRole('button', { name: '保存する' }));

    expect(await findByText('テンプレート名を1〜60文字で入力してください')).toBeTruthy();
    expect(saveMyTemplate).not.toHaveBeenCalled();
  });

  it('shows the limit screen when the Free limit is reached, with a way to the existing template', async () => {
    arrange();
    jest.mocked(saveMyTemplate).mockRejectedValue({ code: 'resource-exhausted' });
    const { getByRole, findByText } = await render(<SaveTemplateScreen />);

    await fireEvent.press(getByRole('button', { name: '保存する' }));

    expect(await findByText('Freeプランで保存できるマイテンプレートは1件までです')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: '既存のテンプレートを確認する' }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/templates');
    await fireEvent.press(getByRole('button', { name: '後で' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('shows the server reason when the list has no items', async () => {
    arrange();
    jest.mocked(saveMyTemplate).mockRejectedValue({ code: 'invalid-argument', message: '項目がないリストはテンプレートにできません' });
    const { getByRole, findByText } = await render(<SaveTemplateScreen />);

    await fireEvent.press(getByRole('button', { name: '保存する' }));

    expect(await findByText('項目がないリストはテンプレートにできません')).toBeTruthy();
  });

  it('disables saving while offline and says why', async () => {
    arrange(true);
    const { getByRole, getByText } = await render(<SaveTemplateScreen />);

    expect(getByText('オフラインのため使えません。オンライン接続が必要です')).toBeTruthy();
    expect(getByRole('button', { name: '保存する' })).toBeDisabled();
  });
});
