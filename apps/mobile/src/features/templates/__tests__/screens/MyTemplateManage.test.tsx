import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import type { MyTemplate } from '@soroe/shared';

import TemplateDetailScreen from '../../../../app/template-detail';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';
import { useSession } from '../../../session/SessionProvider';
import {
  deleteMyTemplate,
  removeMyTemplateItems,
  renameMyTemplate,
  subscribeToMyTemplate,
  subscribeToOfficialTemplateItems,
  subscribeToOfficialTemplates,
} from '../../TemplateRepository';

const mockRouter = { replace: jest.fn(), back: jest.fn() };
const mockParams: { source: string; templateId: string } = { source: 'my', templateId: 't1' };
let emitTemplate: (template: MyTemplate | null) => void;

jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => mockRouter, Redirect: () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
jest.mock('../../TemplateRepository', () => ({
  createListFromTemplate: jest.fn(),
  deleteMyTemplate: jest.fn(),
  removeMyTemplateItems: jest.fn(),
  renameMyTemplate: jest.fn(),
  subscribeToMyTemplate: jest.fn(),
  subscribeToOfficialTemplateItems: jest.fn(),
  subscribeToOfficialTemplates: jest.fn(),
}));

const mine: MyTemplate = {
  id: 't1', title: 'キャンプ', description: '家族用', listType: 'packing', icon: 'suitcase', color: 'primary', itemCount: 2,
  items: [
    { id: 'a', name: 'テント', quantity: null, unit: null, category: null, note: null, checked: false },
    { id: 'b', name: '寝袋', quantity: null, unit: null, category: null, note: null, checked: true },
  ],
  createdAt: 1, updatedAt: 1,
};

describe('managing a my-template (MYTM-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.source = 'my';
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1', language: 'ja' } } as ReturnType<typeof useSession>);
    jest.mocked(useConnectivity).mockReturnValue({ isOffline: false, isRetrying: false, retry: jest.fn() });
    jest.mocked(subscribeToMyTemplate).mockImplementation((_uid, _id, onChange) => {
      emitTemplate = onChange;
      onChange(mine);
      return jest.fn();
    });
  });

  it('renames the template and changes its description', async () => {
    const { getByRole, getByLabelText } = await render(<TemplateDetailScreen />);

    await fireEvent.press(getByRole('button', { name: '編集する' }));
    await fireEvent.changeText(getByLabelText('テンプレート名'), 'キャンプ(夏)');
    await fireEvent.changeText(getByLabelText('説明(任意)'), '');
    await fireEvent.press(getByRole('button', { name: '変更を保存' }));

    expect(renameMyTemplate).toHaveBeenCalledWith('uid-1', 't1', { title: 'キャンプ(夏)', description: null });
    expect(removeMyTemplateItems).not.toHaveBeenCalled();
  });

  it('removes items and saves only the remaining ones', async () => {
    const { getByRole } = await render(<TemplateDetailScreen />);

    await fireEvent.press(getByRole('button', { name: '編集する' }));
    await fireEvent.press(getByRole('button', { name: 'テントを外す' }));
    await fireEvent.press(getByRole('button', { name: '変更を保存' }));

    expect(removeMyTemplateItems).toHaveBeenCalledWith('uid-1', 't1', [mine.items[1]]);
    expect(renameMyTemplate).not.toHaveBeenCalled();
  });

  it('can put a removed item back before saving', async () => {
    const { getByRole } = await render(<TemplateDetailScreen />);

    await fireEvent.press(getByRole('button', { name: '編集する' }));
    await fireEvent.press(getByRole('button', { name: 'テントを外す' }));
    await fireEvent.press(getByRole('button', { name: 'テントを戻す' }));
    await fireEvent.press(getByRole('button', { name: '変更を保存' }));

    expect(removeMyTemplateItems).not.toHaveBeenCalled();
  });

  it('refuses an empty title and removing every item', async () => {
    const { getByRole, getByLabelText, findByText } = await render(<TemplateDetailScreen />);
    await fireEvent.press(getByRole('button', { name: '編集する' }));

    await fireEvent.changeText(getByLabelText('テンプレート名'), '');
    await fireEvent.press(getByRole('button', { name: '変更を保存' }));
    expect(await findByText('テンプレート名を1〜60文字で入力してください')).toBeTruthy();

    await fireEvent.changeText(getByLabelText('テンプレート名'), 'キャンプ');
    await fireEvent.press(getByRole('button', { name: 'テントを外す' }));
    await fireEvent.press(getByRole('button', { name: '寝袋を外す' }));
    await fireEvent.press(getByRole('button', { name: '変更を保存' }));
    expect(await findByText('項目を1つ以上残してください')).toBeTruthy();

    expect(renameMyTemplate).not.toHaveBeenCalled();
    expect(removeMyTemplateItems).not.toHaveBeenCalled();
  });

  it('deletes the template only after confirmation, then goes back', async () => {
    const { getByRole } = await render(<TemplateDetailScreen />);

    await fireEvent.press(getByRole('button', { name: 'テンプレートを削除' }));
    expect(deleteMyTemplate).not.toHaveBeenCalled();
    const buttons = jest.mocked(Alert.alert).mock.calls[0][2] as AlertButton[];
    await act(async () => buttons.find((button) => button.text === '削除する')!.onPress?.());

    expect(deleteMyTemplate).toHaveBeenCalledWith('uid-1', 't1');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('does not flash the not-found screen while leaving after a delete', async () => {
    const { getByRole, queryByText } = await render(<TemplateDetailScreen />);

    await fireEvent.press(getByRole('button', { name: 'テンプレートを削除' }));
    const buttons = jest.mocked(Alert.alert).mock.calls[0][2] as AlertButton[];
    await act(async () => {
      buttons.find((button) => button.text === '削除する')!.onPress?.();
      emitTemplate(null); // 手元の削除は購読へ即座にnullとして返る
    });

    expect(queryByText('テンプレートが見つかりません')).toBeNull();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('offers no management for an official template', async () => {
    mockParams.source = 'official';
    jest.mocked(subscribeToOfficialTemplates).mockImplementation((onChange) => {
      onChange([]);
      return jest.fn();
    });
    jest.mocked(subscribeToOfficialTemplateItems).mockImplementation((_id, onChange) => {
      onChange([]);
      return jest.fn();
    });
    const { queryByRole } = await render(<TemplateDetailScreen />);

    expect(queryByRole('button', { name: '編集する' })).toBeNull();
    expect(queryByRole('button', { name: 'テンプレートを削除' })).toBeNull();
  });
});
