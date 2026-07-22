import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing, Typography } from '@/design-system';
import { useSession } from '@/features/session/SessionProvider';
import { savePendingInviteToken } from '@/features/session/pending-invite';

// Universal Link landing route for family invites (自前ドメイン, Firebase
// Dynamic Linksは不使用). Reachable while unauthenticated: the token is
// persisted and the user is sent to sign in, then (app)/_layout.tsx resumes
// this route once useSession() becomes 'authenticated'. Actual invite
// acceptance is SHARE-001+.
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated' && token) {
      savePendingInviteToken(token).then(() => router.replace('/login'));
    }
  }, [status, token, router]);

  if (status !== 'authenticated') {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Text style={[Typography.title, styles.text]}>招待を確認しています…</Text>
      <Text style={[Typography.body, styles.text]}>{token}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[3],
  },
  text: {
    color: Colors.textPrimary,
  },
});
