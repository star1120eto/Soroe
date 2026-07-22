import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Banner,
  BottomTab,
  Button,
  Checkbox,
  Chip,
  Colors,
  EmptyState,
  ErrorState,
  Input,
  ListRow,
  PlanCard,
  Skeleton,
  Spacing,
  TemplateCard,
  Typography,
  useAppFonts,
} from '@/design-system';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[Typography.title, styles.sectionTitle]}>{title}</Text>
      {children}
    </View>
  );
}

export default function ComponentsCatalogScreen() {
  const [fontsLoaded] = useAppFonts();
  const [checked, setChecked] = useState(false);
  const [selectedTab, setSelectedTab] = useState('list');
  const [selectedPlan, setSelectedPlan] = useState(true);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[Typography.display, styles.pageTitle]}>Components</Text>

        <Section title="Button">
          <View style={styles.row}>
            <Button label="保存する" onPress={() => {}} variant="primary" />
            <Button label="キャンセル" onPress={() => {}} variant="secondary" />
          </View>
          <View style={styles.row}>
            <Button label="あとで" onPress={() => {}} variant="text" />
            <Button label="削除する" onPress={() => {}} variant="destructive" />
            <Button label="保存する" onPress={() => {}} disabled />
            <Button label="保存する" onPress={() => {}} loading />
          </View>
        </Section>

        <Section title="Input">
          <Input placeholder="リスト名を入力" />
          <Input defaultValue="今週の買い物" />
          <Input defaultValue="今週の買い物" errorMessage="名前を入力してください" />
        </Section>

        <Section title="Checkbox">
          <Checkbox checked={checked} onChange={setChecked} />
        </Section>

        <Section title="List Row">
          <ListRow label="トマト" checked={checked} onChange={setChecked} meta="3個" />
          <ListRow label="ヨーグルト" checked onChange={() => {}} meta="Mさんが完了" />
        </Section>

        <Section title="Chip">
          <View style={styles.row}>
            <Chip label="選択中" variant="selected" />
            <Chip label="通常" variant="default" />
            <Chip label="複数選択" variant="multiSelect" />
          </View>
        </Section>

        <Section title="Template Card">
          <TemplateCard icon="suitcase" title="1泊2日の旅行" subtitle="子連れの必需品・24項目" />
        </Section>

        <Section title="Bottom Tab">
          <BottomTab
            items={[
              { key: 'list', icon: 'house', label: 'リスト' },
              { key: 'templates', icon: 'squares-four', label: 'テンプレート' },
              { key: 'ai', icon: 'sparkle', label: 'AI生成' },
              { key: 'settings', icon: 'gear', label: '設定' },
            ]}
            selectedKey={selectedTab}
            onSelect={setSelectedTab}
          />
        </Section>

        <Section title="Paywall / Plan Card">
          <PlanCard
            title="年額プラン"
            price="4,800円 / 年"
            badge="2ヶ月お得"
            selected={selectedPlan}
            onPress={() => setSelectedPlan(!selectedPlan)}
          />
        </Section>

        <Section title="Banner">
          <Banner message="家族が新しい項目を追加しました" variant="info" />
          <Banner message="オフラインです。復帰後に同期します" variant="warning" />
          <Banner message="この操作は取り消せません" variant="danger" />
        </Section>

        <Section title="Empty State">
          <EmptyState title="リストがありません" description="最初のリストを作成しましょう" actionLabel="作成する" onAction={() => {}} />
        </Section>

        <Section title="Error State">
          <ErrorState title="読み込みに失敗しました" description="通信環境をご確認ください" retryLabel="再試行" onRetry={() => {}} />
        </Section>

        <Section title="Skeleton">
          <Skeleton width="100%" height={16} />
          <Skeleton width="60%" height={16} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing[5],
    gap: Spacing[6],
  },
  pageTitle: {
    color: Colors.textPrimary,
  },
  section: {
    gap: Spacing[3],
  },
  sectionTitle: {
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
});
