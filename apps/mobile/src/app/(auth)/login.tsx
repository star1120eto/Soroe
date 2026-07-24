import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Colors, Spacing, Typography } from '@/design-system';
import { signInWithApple, signInWithGoogle } from '@/features/session/AuthGateway';
import { readPendingInviteToken } from '@/features/session/pending-invite';

export default function LoginScreen() {
  const router = useRouter();
  const [hasPendingInvite, setHasPendingInvite] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingMethod, setPendingMethod] = useState<'apple' | 'google' | null>(null);

  useEffect(() => {
    readPendingInviteToken().then((token) => setHasPendingInvite(token !== null));
  }, []);

  // キャンセルはエラー表示にしない(AUTH-01)。成功時はSessionProviderの
  // onAuthStateChangedがルートを切り替えるので、ここでは遷移しない。
  const runSignIn = async (method: 'apple' | 'google') => {
    setErrorMessage(null);
    setPendingMethod(method);
    try {
      await (method === 'apple' ? signInWithApple() : signInWithGoogle());
    } catch {
      setErrorMessage('サインインに失敗しました。時間をおいてお試しください');
    } finally {
      setPendingMethod(null);
    }
  };

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
        {errorMessage ? <Banner message={errorMessage} variant="danger" /> : null}

        {Platform.OS === 'ios' ? (
          <Button
            label="Appleで続ける"
            onPress={() => runSignIn('apple')}
            loading={pendingMethod === 'apple'}
            disabled={pendingMethod !== null}
          />
        ) : null}
        <Button
          label="Googleで続ける"
          onPress={() => runSignIn('google')}
          variant="secondary"
          loading={pendingMethod === 'google'}
          disabled={pendingMethod !== null}
        />
        <Button
          label="メールで続ける"
          onPress={() => router.push('/email')}
          variant="secondary"
          disabled={pendingMethod !== null}
        />
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
    marginBottom: Spacing[2],
  },
});
