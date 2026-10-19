import { fireEvent, render } from '@testing-library/react-native';
import type { MyTemplate, OfficialTemplate } from '@soroe/shared';

import TemplatesScreen from '../../../../app/(app)/templates';
import { useConnectivity } from '../../../connectivity/ConnectivityProvider';
import { useSession } from '../../../session/SessionProvider';
import { subscribeToMyTemplates, subscribeToOfficialTemplates } from '../../TemplateRepository';

const mockRouter = { push: jest.fn() };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../../../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../../connectivity/ConnectivityProvider', () => ({ useConnectivity: jest.fn() }));
jest.mock('../../TemplateRepository', () => ({
  subscribeToOfficialTemplates: jest.fn(),
  subscribeToMyTemplates: jest.fn(),
}));

function official(id: string, priority: number, title: string, enTitle: string): OfficialTemplate {
  return {
    id,
    category: 'outdoor',
    priority,
    published: true,
    listType: 'packing',
    icon: 'suitcase',
    adjustableByPeople: false,
    defaultPartySize: 2,
    hasSafetyNotice: false,
    itemCount: 12,
    ja: { title, description: `${title}の説明`, notice: null },
    en: { title: enTitle, description: `About ${enTitle}`, notice: null },
  };
}

const mine: MyTemplate = {
  id: 't1',
  title: '週末のキャンプ',
  description: null,
  listType: 'packing',
  icon: 'suitcase',
  color: 'primary',
  itemCount: 2,
  items: [],
  createdAt: 1,
  updatedAt: 1,
};

function arrange({ language = 'ja', myTemplates = [] as MyTemplate[], offline = false } = {}) {
  jest.mocked(useSession).mockReturnValue({ profile: { uid: 'uid-1', language } } as ReturnType<typeof useSession>);
  jest.mocked(useConnectivity).mockReturnValue({ isOffline: offline, isRetrying: false, retry: jest.fn() });
  jest.mocked(subscribeToOfficialTemplates).mockImplementation((onChange) => {
    onChange([official('day-hike', 10, '日帰り登山', 'Day hike'), official('camping', 20, 'キャンプ', 'Camping')]);
    return jest.fn();
  });
  jest.mocked(subscribeToMyTemplates).mockImplementation((_uid, onChange) => {
    onChange(myTemplates);
    return jest.fn();
  });
}

describe('TemplatesScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists the official templates with their descriptions and item counts', async () => {
    arrange();
    const { getByText } = await render(<TemplatesScreen />);

    expect(getByText('日帰り登山')).toBeTruthy();
    expect(getByText('キャンプ')).toBeTruthy();
    expect(getByText('日帰り登山の説明(12項目)')).toBeTruthy();
  });

  it('shows the English text when the language is English', async () => {
    arrange({ language: 'en' });
    const { getByText, queryByText } = await render(<TemplatesScreen />);

    expect(getByText('Day hike')).toBeTruthy();
    expect(queryByText('日帰り登山')).toBeNull();
  });

  it('opens the detail of the tapped official template', async () => {
    arrange();
    const { getByText } = await render(<TemplatesScreen />);

    await fireEvent.press(getByText('日帰り登山'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/template-detail',
      params: { source: 'official', templateId: 'day-hike' },
    });
  });

  it('shows an empty state on the my-templates tab when nothing is saved', async () => {
    arrange();
    const { getByRole, getByText } = await render(<TemplatesScreen />);

    await fireEvent.press(getByRole('button', { name: 'マイ' }));

    expect(getByText('保存したテンプレートはありません')).toBeTruthy();
  });

  it('lists my templates and opens one', async () => {
    arrange({ myTemplates: [mine] });
    const { getByRole, getByText } = await render(<TemplatesScreen />);

    await fireEvent.press(getByRole('button', { name: 'マイ' }));
    await fireEvent.press(getByText('週末のキャンプ'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/template-detail',
      params: { source: 'my', templateId: 't1' },
    });
  });

  it('shows the offline banner while offline', async () => {
    arrange({ offline: true });
    const { getByText } = await render(<TemplatesScreen />);

    expect(getByText('オフラインです。変更は端末に保存され、復帰後に自動で同期します')).toBeTruthy();
  });
});
