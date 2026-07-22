import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Colors, Spacing, Typography } from '@/design-system';
import { useSession } from '@/features/session/SessionProvider';
import { readPendingInviteToken } from '@/features/session/pending-invite';

// Placeholder for AUTH-005 (ログイン、メール入力、OTP入力、初期プロフィール画面).
// NAV-001 only needs a route that can flip useSession() to 'authenticated'
// so the (auth) → (app) guard transition can be exercised.
export default function LoginScreen() {
  const { signInForDev } = useSession();
  const [hasPendingInvite, setHasPendingInvite] = useState(false);

  useEffect(() => {
    readPendingInviteToken().then((token) => setHasPendingInvite(token !== null));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={[Typography.display, styles.title]}>Soroe</Text>
        <Text style={[Typography.body, styles.description]}>
          家族で共有する買い物・持ち物リスト
        </Text>
        {hasPendingInvite ? (
          <Banner message="招待を確認しました。ログインすると続きに進みます" variant="info" />
        ) : null}
        <Button label="ログインする(開発用)" onPress={signInForDev} variant="primary" />
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
    flex: 1,
    justifyContent: 'center',
    padding: Spacing[6],
    gap: Spacing[4],
  },
  title: {
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
