import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import type { MyTemplate, OfficialTemplate, OfficialTemplateItem } from '@soroe/shared';

import TemplateDetailScreen from '../../../../app/template-detail';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';
import { useSession } from '../../../session/SessionProvider';
import {
  createListFromTemplate,
  subscribeToMyTemplate,
  subscribeToOfficialTemplateItems,
  subscribeToOfficialTemplates,
} from '../../TemplateRepository';

const mockRouter = { replace: jest.fn(), back: jest.fn() };
const mockParams: { source: string; templateId: string } = { source: 'official', templateId: 'day-hike' };

jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => mockRouter, Redirect: () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
jest.mock('../../TemplateRepository', () => ({
  createListFromTemplate: jest.fn(),
  subscribeToMyTemplate: jest.fn(),
  subscribeToOfficialTemplateItems: jest.fn(),
  subscribeToOfficialTemplates: jest.fn(),
}));

function template(overrides: Partial<OfficialTemplate> = {}): OfficialTemplate {
  return {
    id: 'day-hike',
    category: 'outdoor',
    priority: 10,
    published: true,
    listType: 'packing',
    icon: 'suitcase',
    adjustableByPeople: true,
    defaultPartySize: 2,
    hasSafetyNotice: false,
    itemCount: 2,
    ja: { title: '日帰り登山', description: '低山の持ち物', notice: null },
    en: { title: 'Day hike', description: 'Things to bring', notice: null },
    ...overrides,
  };
}

const items: OfficialTemplateItem[] = [
  { id: 'water', sortOrder: 1000, quantity: 1, perPerson: true, ja: { name: '水', unit: 'L', category: null, note: null }, en: { name: 'Water', unit: 'L', category: null, note: null } },
  { id: 'map', sortOrder: 2000, quantity: null, perPerson: false, ja: { name: '地図', unit: null, category: null, note: null }, en: { name: 'Map', unit: null, category: null, note: null } },
];

function arrange({ tpl = template(), offline = false, language = 'ja' } = {}) {
  jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1', language } } as ReturnType<typeof useSession>);
  jest.mocked(useConnectivity).mockReturnValue({ isOffline: offline, isRetrying: false, retry: jest.fn() });
  jest.mocked(subscribeToOfficialTemplates).mockImplementation((onChange) => {
    onChange([tpl]);
    return jest.fn();
  });
  jest.mocked(subscribeToOfficialTemplateItems).mockImplementation((_id, onChange) => {
    onChange(items);
    return jest.fn();
  });
}

describe('TemplateDetailScreen (official)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.source = 'official';
    mockParams.templateId = 'day-hike';
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(createListFromTemplate).mockResolvedValue({ listId: 'list-9' });
  });

  it('shows the description and every item selected at first', async () => {
    arrange();
    const { getByText, getAllByRole } = await render(<TemplateDetailScreen />);

    expect(getByText('低山の持ち物')).toBeTruthy();
    expect(getByText('水')).toBeTruthy();
    expect(getByText('地図')).toBeTruthy();
    expect(getAllByRole('checkbox').filter((box) => box.props.accessibilityState?.checked)).toHaveLength(2);
  });

  it('creates the list from the selected items only, with the party size, and opens it', async () => {
    arrange();
    const { getByText, getByRole } = await render(<TemplateDetailScreen />);

    await fireEvent.press(getByText('地図'));
    await fireEvent.press(getByRole('button', { name: '4人' }));
    await fireEvent.press(getByRole('button', { name: 'リストを作成' }));

    expect(createListFromTemplate).toHaveBeenCalledWith({
      source: 'official',
      templateId: 'day-hike',
      itemIds: ['water'],
      partySize: 4,
      language: 'ja',
      requestId: 'uuid-1',
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/list/list-9');
  });

  it('scales the per-person quantity shown when the party size changes', async () => {
    arrange();
    const { getByText, getByRole } = await render(<TemplateDetailScreen />);

    expect(getByText('2L')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: '5人' }));

    expect(getByText('5L')).toBeTruthy();
  });

  it('does not offer a party size for a template that is not adjustable', async () => {
    arrange({ tpl: template({ adjustableByPeople: false }) });
    const { queryByRole } = await render(<TemplateDetailScreen />);

    expect(queryByRole('button', { name: '4人' })).toBeNull();
  });

  it('shows the safety notice first and creates only after it is confirmed', async () => {
    arrange({ tpl: template({ hasSafetyNotice: true, ja: { title: '日帰り登山', description: '低山の持ち物', notice: '安全を保証するものではありません' } }) });
    const { getByRole } = await render(<TemplateDetailScreen />);

    await fireEvent.press(getByRole('button', { name: 'リストを作成' }));

    expect(createListFromTemplate).not.toHaveBeenCalled();
    const calls = jest.mocked(Alert.alert).mock.calls;
    expect(calls[0][1]).toBe('安全を保証するものではありません');
    const buttons = calls[0][2] as AlertButton[];
    await act(async () => buttons.find((button) => button.text === '確認して作成')!.onPress?.());
    expect(createListFromTemplate).toHaveBeenCalledTimes(1);
  });

  it('explains the Free list limit when creating is refused', async () => {
    arrange();
    jest.mocked(createListFromTemplate).mockRejectedValue({ code: 'resource-exhausted' });
    const { getByRole, findByText } = await render(<TemplateDetailScreen />);

    await fireEvent.press(getByRole('button', { name: 'リストを作成' }));

    expect(await findByText('Freeプランで利用できるリストは3件までです')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('disables creating while offline and says why', async () => {
    arrange({ offline: true });
    const { getByRole, getByText } = await render(<TemplateDetailScreen />);

    expect(getByText('オフラインのため使えません。オンライン接続が必要です')).toBeTruthy();
    expect(getByRole('button', { name: 'リストを作成' })).toBeDisabled();
  });

  it('disables creating when no item is selected', async () => {
    arrange();
    const { getByRole, getByText } = await render(<TemplateDetailScreen />);

    await fireEvent.press(getByText('水'));
    await fireEvent.press(getByText('地図'));

    expect(getByRole('button', { name: 'リストを作成' })).toBeDisabled();
  });

  it('shows the English text for an English user', async () => {
    arrange({ language: 'en' });
    const { getByText } = await render(<TemplateDetailScreen />);

    expect(getByText('Things to bring')).toBeTruthy();
    expect(getByText('Water')).toBeTruthy();
  });
});

describe('TemplateDetailScreen (my template)', () => {
  const mine: MyTemplate = {
    id: 't1', title: 'キャンプ', description: '家族用', listType: 'packing', icon: 'suitcase', color: 'primary', itemCount: 2,
    items: [
      { id: 'a', name: 'テント', quantity: null, unit: null, category: null, note: null, checked: false },
      { id: 'b', name: '寝袋', quantity: 2, unit: '個', category: null, note: null, checked: true },
    ],
    createdAt: 1, updatedAt: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.source = 'my';
    mockParams.templateId = 't1';
    jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1', language: 'ja' } } as ReturnType<typeof useSession>);
    jest.mocked(useConnectivity).mockReturnValue({ isOffline: false, isRetrying: false, retry: jest.fn() });
    jest.mocked(subscribeToMyTemplate).mockImplementation((_uid, _id, onChange) => {
      onChange(mine);
      return jest.fn();
    });
    jest.mocked(createListFromTemplate).mockResolvedValue({ listId: 'list-7' });
  });

  it('creates a list from a my-template without a party size', async () => {
    const { getByText, getByRole, queryByRole } = await render(<TemplateDetailScreen />);

    expect(getByText('家族用')).toBeTruthy();
    expect(queryByRole('button', { name: '4人' })).toBeNull();
    await fireEvent.press(getByText('テント'));
    await fireEvent.press(getByRole('button', { name: 'リストを作成' }));

    expect(createListFromTemplate).toHaveBeenCalledWith({
      source: 'my',
      templateId: 't1',
      itemIds: ['b'],
      partySize: undefined,
      language: 'ja',
      requestId: 'uuid-1',
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/list/list-7');
  });
});
