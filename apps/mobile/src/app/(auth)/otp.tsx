import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { verifyEmailOtpInputSchema } from '@soroe/shared';

import { Banner, Button, Colors, Input, Spacing, Typography } from '@/design-system';
import { requestEmailOtp, signInWithEmailOtp } from '@/features/session/AuthGateway';
import { getOrCreateDeviceId } from '@/features/session/device-id';

// soroe-functional-specification.md 16章「OTP再送待ち: 60秒」。
const RESEND_COOLDOWN_SECONDS = 60;

export default function OtpScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (resendSecondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(() => setResendSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSecondsLeft]);

  // 成功時はSessionProviderのonAuthStateChangedがルートを切り替える。
  const submit = async () => {
    setErrorMessage(null);
    setInfoMessage(null);

    const parsed = verifyEmailOtpInputSchema.safeParse({ email, code });
    if (!parsed.success) {
      setErrorMessage('6桁の数字を入力してください');
      return;
    }

    setIsSubmitting(true);
    try {
      await signInWithEmailOtp(parsed.data);
    } catch {
      setErrorMessage('コードを確認できませんでした。入力内容をご確認ください');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resend = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      await requestEmailOtp({ email, deviceId });
      setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setInfoMessage('コードを再送しました');
    } catch {
      setErrorMessage('コードを再送できませんでした。時間をおいてお試しください');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={[Typography.title, styles.title]}>確認コードを入力</Text>
        <Text style={[Typography.body, styles.description]}>{email} に送信しました</Text>

        {errorMessage ? <Banner message={errorMessage} variant="danger" /> : null}
        {infoMessage ? <Banner message={infoMessage} variant="info" /> : null}

        <Input
          placeholder="123456"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="one-time-code"
          editable={!isSubmitting}
        />
        <Button label="確認する" onPress={submit} loading={isSubmitting} />
        <Button
          label={resendSecondsLeft > 0 ? `再送する(${resendSecondsLeft}秒)` : '再送する'}
          onPress={resend}
          variant="secondary"
          disabled={resendSecondsLeft > 0 || isSubmitting}
        />
        <Button
          label="メールアドレスを変更"
          onPress={() => router.back()}
          variant="text"
          disabled={isSubmitting}
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
  },
  description: {
    color: Colors.textSecondary,
  },
});
