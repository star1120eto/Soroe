import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MyTemplate, OfficialTemplate } from '@soroe/shared';

import {
  Chip,
  Colors,
  EmptyState,
  ErrorState,
  Skeleton,
  Spacing,
  TemplateCard,
  Typography,
  isPhIconName,
} from '@/design-system';
import { useConnectivity } from '@/features/connectivity/ConnectivityProvider';
import { OfflineBanner } from '@/features/connectivity/OfflineBanner';
import { useSession } from '@/features/session/SessionProvider';
import { subscribeToMyTemplates, subscribeToOfficialTemplates } from '@/features/templates/TemplateRepository';
import { localizeTemplate } from '@/features/templates/templateText';

type Tab = 'official' | 'my';

// TMPL-01 / MYTM-01: 公式テンプレートとマイテンプレートの一覧。公式はFirestoreのキャッシュで
// オフラインでも読める。カードを押すと詳細(項目選択・リスト作成)を開く。
export default function TemplatesScreen() {
  const router = useRouter();
  // (app)グループはstatus==='authenticated'のときだけ描画されるため、profileは必ず非null。
  const { profile } = useSession();
  const uid = profile!.uid;
  const language = profile!.language;
  const { isOffline, isRetrying, retry } = useConnectivity();

  const [tab, setTab] = useState<Tab>('official');
  const [official, setOfficial] = useState<OfficialTemplate[] | null>(null);
  const [mine, setMine] = useState<MyTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onError = () => setError('テンプレートを読み込めませんでした');
    const unsubscribeOfficial = subscribeToOfficialTemplates((templates) => {
      setError(null);
      setOfficial(templates);
    }, onError);
    const unsubscribeMine = subscribeToMyTemplates(uid, setMine, onError);
    return () => {
      unsubscribeOfficial();
      unsubscribeMine();
    };
  }, [uid]);

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState title="読み込みに失敗しました" description={error} />
      </SafeAreaView>
    );
  }

  const open = (source: Tab, templateId: string) =>
    router.push({ pathname: '/template-detail', params: { source, templateId } });

  const loading = tab === 'official' ? official === null : mine === null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <OfflineBanner isOffline={isOffline} pendingCount={0} isRetrying={isRetrying} onRetry={retry} />
        <Text style={[Typography.title, styles.title]}>テンプレート</Text>
        <View style={styles.tabs}>
          <Chip label="公式" variant={tab === 'official' ? 'selected' : 'default'} onPress={() => setTab('official')} />
          <Chip label="マイ" variant={tab === 'my' ? 'selected' : 'default'} onPress={() => setTab('my')} />
        </View>

        {loading ? (
          <>
            <Skeleton width="100%" height={72} />
            <Skeleton width="100%" height={72} />
          </>
        ) : tab === 'official' ? (
          official!.length === 0 ? (
            <EmptyState title="テンプレートがありません" description="しばらくしてからもう一度お試しください" />
          ) : (
            official!.map((template) => {
              const text = localizeTemplate(template, language);
              return (
                <TemplateCard
                  key={template.id}
                  icon={isPhIconName(template.icon) ? template.icon : 'tray'}
                  title={text.title}
                  subtitle={`${text.description}(${template.itemCount}項目)`}
                  onPress={() => open('official', template.id)}
                />
              );
            })
          )
        ) : mine!.length === 0 ? (
          <EmptyState
            title="保存したテンプレートはありません"
            description="リスト詳細のメニューから、よく使うリストを保存できます"
          />
        ) : (
          mine!.map((template) => (
            <TemplateCard
              key={template.id}
              icon={isPhIconName(template.icon) ? template.icon : 'tray'}
              title={template.title}
              subtitle={`${template.description ?? 'マイテンプレート'}(${template.itemCount}項目)`}
              onPress={() => open('my', template.id)}
            />
          ))
        )}
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
    gap: Spacing[4],
  },
  title: {
    color: Colors.textPrimary,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
});
