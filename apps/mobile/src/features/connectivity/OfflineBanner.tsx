import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Colors, Spacing, Typography } from '@/design-system';

import { OFFLINE_BANNER_MESSAGE } from './offlineMessages';

type OfflineBannerProps = {
  isOffline: boolean;
  /** 開いているリストで未送信の項目の数。一覧など件数を持たない画面は0を渡す。 */
  pendingCount: number;
  isRetrying: boolean;
  onRetry: () => void;
};

// OFF-001: オフラインの帯と未同期件数。オンラインで未送信が残る間は「同期中」を出す。
export function OfflineBanner({ isOffline, pendingCount, isRetrying, onRetry }: OfflineBannerProps) {
  if (!isOffline) {
    return pendingCount > 0 ? <Banner message={`同期中です(${pendingCount}件)`} variant="info" /> : null;
  }

  return (
    <View style={styles.container}>
      <Banner message={OFFLINE_BANNER_MESSAGE} variant="warning" />
      {pendingCount > 0 ? <Text style={[Typography.caption, styles.count]}>未同期 {pendingCount}件</Text> : null}
      <Button label="再試行" variant="secondary" onPress={onRetry} loading={isRetrying} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[2],
  },
  count: {
    color: Colors.textSecondary,
  },
});
