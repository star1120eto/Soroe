import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AiQuota } from '@soroe/shared';

import { Banner, Button, Colors, Skeleton, Spacing, Typography } from '@/design-system';
import { getAiQuota } from '@/features/ai/AiRepository';
import { formatReset } from '@/features/ai/aiMessages';
import { readPendingAiRequest } from '@/features/ai/pendingAiRequest';
import { useConnectivity } from '@/features/connectivity/ConnectivityProvider';
import { OFFLINE_REQUIRED_MESSAGE } from '@/features/connectivity/offlineMessages';

// AI-01: AI生成の入口。残り回数(Freeは生涯1回、Premiumは日本時間の月20回)を表示し、条件入力を始める。
// 回数の正はサーバー(getAiQuota)。上限・オフラインのときは始められず、理由を表示する。
export default function AiScreen() {
  const router = useRouter();
  const { isOffline } = useConnectivity();

  const [quota, setQuota] = useState<AiQuota | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  // 結果画面から戻ったときなど、表示するたびに最新の回数と未保存の結果を読み直す。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getAiQuota().then(
        (next) => {
          if (!cancelled) {
            setLoadFailed(false);
            setQuota(next);
          }
        },
        () => {
          if (!cancelled) {
            setLoadFailed(true);
          }
        }
      );
      readPendingAiRequest().then((id) => {
        if (!cancelled) {
          setPendingRequestId(id);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const exhausted = quota !== null && quota.remaining === 0;
  const canStart = quota !== null && !exhausted && !isOffline;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[Typography.title, styles.title]}>AI生成</Text>
        <Text style={[Typography.body, styles.secondary]}>行き先やシーンを伝えると、持ち物や買い物のリストを提案します。</Text>

        {isOffline ? <Banner message={OFFLINE_REQUIRED_MESSAGE} variant="warning" /> : null}
        {loadFailed ? <Banner message="残り回数を読み込めませんでした" variant="danger" /> : null}

        {quota === null ? (
          loadFailed ? null : <Skeleton width="100%" height={48} />
        ) : quota.plan === 'free' ? (
          <Text style={[Typography.heading, styles.title]}>
            {quota.remaining > 0 ? '無料で1回、リストを作れます' : '無料の生成(1回)は使用済みです'}
          </Text>
        ) : (
          <View style={styles.group}>
            <Text style={[Typography.heading, styles.title]}>
              {exhausted ? `今月の生成回数(${quota.limit}回)を使い切りました` : `今月あと${quota.remaining}回(上限${quota.limit}回)`}
            </Text>
            {quota.resetsAt ? (
              <Text style={[Typography.caption, styles.secondary]}>次回のリセットは{formatReset(quota.resetsAt)}です</Text>
            ) : null}
          </View>
        )}

        <Button label="リストを作る" onPress={() => router.push('/ai-flow')} disabled={!canStart} variant="primary" />
        {pendingRequestId ? (
          <Button
            label="前回の結果を見る"
            onPress={() => router.push({ pathname: '/ai-result', params: { requestId: pendingRequestId } })}
            variant="secondary"
          />
        ) : null}
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
  secondary: {
    color: Colors.textSecondary,
  },
  group: {
    gap: Spacing[1],
  },
});
