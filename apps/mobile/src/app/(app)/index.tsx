import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { UserListRef } from '@soroe/shared';

import {
  Button,
  Colors,
  EmptyState,
  ErrorState,
  Skeleton,
  Spacing,
  TemplateCard,
  Typography,
  isPhIconName,
} from '@/design-system';
import { FREE_ACTIVE_LIST_LIMIT, colorValueForToken } from '@/features/lists/listOptions';
import { subscribeToUserLists } from '@/features/lists/ListRepository';
import { useSession } from '@/features/session/SessionProvider';

function summarize(list: UserListRef): string {
  return `${list.completedCount}/${list.totalCount}完了・${list.memberCount}人`;
}

export default function ListScreen() {
  const router = useRouter();
  // (app)グループはstatus==='authenticated'のときだけ描画される
  // (apps/mobile/src/app/_layout.tsx)。そのときprofileは必ず非null。
  const { profile } = useSession();
  const uid = profile!.uid;

  const [lists, setLists] = useState<UserListRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    return subscribeToUserLists(
      uid,
      (nextLists) => {
        setError(null);
        setLists(nextLists);
      },
      () => setError('リストを読み込めませんでした')
    );
  }, [uid, retryKey]);

  const openCreateFlow = () => {
    router.push('/new-list-method');
  };

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState
          title="読み込みに失敗しました"
          description={error}
          retryLabel="再試行"
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      </SafeAreaView>
    );
  }

  if (lists === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Skeleton width="100%" height={72} />
          <Skeleton width="100%" height={72} />
          <Skeleton width="100%" height={72} />
        </View>
      </SafeAreaView>
    );
  }

  if (lists.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <EmptyState
          title="リストがありません"
          description="最初のリストを作成しましょう"
          actionLabel="作成する"
          onAction={openCreateFlow}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[Typography.title, styles.headerTitle]}>リスト</Text>
          <Text style={[Typography.caption, styles.headerCount]}>
            {FREE_ACTIVE_LIST_LIMIT}件中{lists.length}件
          </Text>
        </View>

        {lists.map((list) => (
          <TemplateCard
            key={list.listId}
            icon={isPhIconName(list.icon) ? list.icon : 'tray'}
            title={list.name}
            subtitle={summarize(list)}
            accentColor={colorValueForToken(list.color)}
          />
        ))}

        <Button label="リストを追加" onPress={openCreateFlow} variant="secondary" />
      </View>
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
    gap: Spacing[3],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.textPrimary,
  },
  headerCount: {
    color: Colors.textSecondary,
  },
});
