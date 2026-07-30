import { fireEvent, render } from '@testing-library/react-native';

import { Banner } from '../Banner';
import { BottomTab } from '../BottomTab';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { Chip } from '../Chip';
import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { Input } from '../Input';
import { ListRow } from '../ListRow';
import { PlanCard } from '../PlanCard';
import { Skeleton } from '../Skeleton';
import { TemplateCard } from '../TemplateCard';

describe('Button', () => {
  it('calls onPress when enabled', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Button label="保存する" onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Button label="保存する" onPress={onPress} disabled />);
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Input', () => {
  it('shows the error message when provided', async () => {
    const { getByText } = await render(<Input errorMessage="名前を入力してください" />);
    expect(getByText('名前を入力してください')).toBeTruthy();
  });
});

describe('Checkbox', () => {
  it('toggles via onChange', async () => {
    const onChange = jest.fn();
    const { getByRole } = await render(<Checkbox checked={false} onChange={onChange} />);
    fireEvent.press(getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('ListRow', () => {
  it('renders without throwing', async () => {
    await render(<ListRow label="トマト" checked={false} onChange={() => {}} meta="3個" />);
  });
});

describe('Chip', () => {
  it.each(['default', 'selected', 'multiSelect'] as const)('renders %s variant without throwing', async (variant) => {
    await render(<Chip label="選択中" variant={variant} />);
  });
});

describe('TemplateCard', () => {
  it('renders without throwing', async () => {
    await render(<TemplateCard icon="suitcase" title="1泊2日の旅行" subtitle="子連れの必需品・24項目" />);
  });

  it('renders with a custom accent color without throwing', async () => {
    await render(
      <TemplateCard
        icon="suitcase"
        title="1泊2日の旅行"
        subtitle="子連れの必需品・24項目"
        accentColor="#D9825B"
      />
    );
  });
});

describe('PlanCard', () => {
  it('renders selected without throwing', async () => {
    await render(<PlanCard title="年額プラン" price="4,800円 / 年" badge="2ヶ月お得" selected />);
  });

  it('renders unselected without throwing', async () => {
    await render(<PlanCard title="年額プラン" price="4,800円 / 年" selected={false} />);
  });
});

describe('BottomTab', () => {
  it('calls onSelect with the pressed item key', async () => {
    const onSelect = jest.fn();
    const { getAllByRole } = await render(
      <BottomTab
        items={[
          { key: 'list', icon: 'house', label: 'リスト' },
          { key: 'settings', icon: 'gear', label: '設定' },
        ]}
        selectedKey="list"
        onSelect={onSelect}
      />
    );
    fireEvent.press(getAllByRole('tab')[1]);
    expect(onSelect).toHaveBeenCalledWith('settings');
  });
});

describe('Banner', () => {
  it.each(['info', 'warning', 'danger'] as const)('renders %s variant without throwing', async (variant) => {
    await render(<Banner message="メッセージ" variant={variant} />);
  });
});

describe('EmptyState', () => {
  it('renders without throwing', async () => {
    await render(<EmptyState title="リストがありません" />);
  });
});

describe('ErrorState', () => {
  it('renders without throwing', async () => {
    await render(<ErrorState title="読み込みに失敗しました" retryLabel="再試行" onRetry={() => {}} />);
  });
});

describe('Skeleton', () => {
  it('renders without throwing', async () => {
    await render(<Skeleton width={100} height={16} />);
  });
});
