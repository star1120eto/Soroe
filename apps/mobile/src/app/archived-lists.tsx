import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { UserListRef } from '@soroe/shared';

import { Banner, Button, Colors, EmptyState, ErrorState, Skeleton, Spacing, TemplateCard, Typography, isPhIconName } from '@/design-system';
import { describeListActionError } from '@/features/lists/listActionErrors';
import { colorValueForToken } from '@/features/lists/listOptions';
import { restoreList, subscribeToArchivedOrDeletedLists, unarchiveList } from '@/features/lists/ListRepository';
import { daysRemainingUntilPurge } from '@/features/lists/retention';
import { useSession } from '@/features/session/SessionProvider';

// LIST-006: アーカイブ済み・削除済み(30日以内)のリストを、オーナー操作
// (アクティブに戻す/復元する)とあわせて確認できる画面。
export default function ArchivedListsScreen() {
  const router = useRouter();
  const { profile } = useSession();
  const uid = profile!.uid;

  const [lists, setLists] = useState<UserListRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // Date.now()はレンダー中に直接呼ぶと不純になるため、マウント時の値を
  // 一度だけ取得する(表示中に日をまたいでも画面再訪で更新されれば十分)。
  const [now] = useState(() => Date.now());

  useEffect(() => {
    return subscribeToArchivedOrDeletedLists(
      uid,
      (next) => {
        setError(null);
        setLists(next);
      },
      () => setError('読み込めませんでした')
    );
  }, [uid, retryKey]);

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(describeListActionError(e));
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState title="読み込みに失敗しました" description={error} retryLabel="再試行" onRetry={() => setRetryKey((k) => k + 1)} />
      </SafeAreaView>
    );
  }

  if (lists === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Skeleton width="100%" height={72} />
        </View>
      </SafeAreaView>
    );
  }

  // アーカイブ・削除はオーナーだけが実行できるため、この画面もowner権限の
  // リストだけを対象にする(editorの手元にも同期はされるが操作できない)。
  const ownedLists = lists.filter((list) => list.role === 'owner');
  const archived = ownedLists.filter((list) => list.deletedAt === null);
  const deleted = ownedLists.filter((list) => list.deletedAt !== null);

  if (archived.length === 0 && deleted.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <EmptyState title="アーカイブ・削除済みのリストはありません" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        {actionError ? <Banner message={actionError} variant="danger" /> : null}

        {archived.length > 0 ? (
          <View style={styles.section}>
            <Text style={[Typography.title, styles.sectionTitle]}>アーカイブ済み</Text>
            {archived.map((list) => (
              <View key={list.listId} style={styles.row}>
                <TemplateCard
                  icon={isPhIconName(list.icon) ? list.icon : 'tray'}
                  title={list.name}
                  subtitle="読み取り専用"
                  accentColor={colorValueForToken(list.color)}
                  onPress={() => router.push(`/list/${list.listId}`)}
                />
                <Button
                  label="アクティブに戻す"
                  variant="secondary"
                  onPress={() => runAction(() => unarchiveList(list.listId, randomUUID()))}
                />
              </View>
            ))}
          </View>
        ) : null}

        {deleted.length > 0 ? (
          <View style={styles.section}>
            <Text style={[Typography.title, styles.sectionTitle]}>削除済み</Text>
            {deleted.map((list) => (
              <View key={list.listId} style={styles.row}>
                <TemplateCard
                  icon={isPhIconName(list.icon) ? list.icon : 'tray'}
                  title={list.name}
                  subtitle={`復元期限まであと${daysRemainingUntilPurge(list.deletedAt!, now)}日`}
                  accentColor={colorValueForToken(list.color)}
                />
                <Button
                  label="復元する"
                  variant="secondary"
                  onPress={() => runAction(() => restoreList(list.listId, randomUUID()))}
                />
              </View>
            ))}
          </View>
        ) : null}
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
    gap: Spacing[4],
  },
  section: {
    gap: Spacing[3],
  },
  sectionTitle: {
    color: Colors.textPrimary,
  },
  row: {
    gap: Spacing[2],
  },
});
