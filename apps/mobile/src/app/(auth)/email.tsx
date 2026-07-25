import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestEmailOtpInputSchema } from '@soroe/shared';

import { Banner, Button, Colors, Input, Spacing, Typography } from '@/design-system';
import { requestEmailOtp } from '@/features/session/AuthGateway';
import { getOrCreateDeviceId } from '@/features/session/device-id';

export default function EmailScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setValidationError(null);
    setRequestError(null);

    const deviceId = await getOrCreateDeviceId();
    const parsed = requestEmailOtpInputSchema.safeParse({ email, deviceId });
    if (!parsed.success) {
      setValidationError('メールアドレスの形式が正しくありません');
      return;
    }

    setIsSubmitting(true);
    try {
      await requestEmailOtp(parsed.data);
      router.push({ pathname: '/otp', params: { email: parsed.data.email } });
    } catch {
      setRequestError('コードを送信できませんでした。時間をおいてお試しください');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={[Typography.title, styles.title]}>メールアドレスを入力</Text>
        <Text style={[Typography.body, styles.description]}>
          確認コードを6桁の数字でお送りします
        </Text>

        {requestError ? <Banner message={requestError} variant="danger" /> : null}

        <Input
          placeholder="mail@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          errorMessage={validationError ?? undefined}
          editable={!isSubmitting}
        />
        <Button label="コードを送る" onPress={submit} loading={isSubmitting} />
        <Button label="戻る" onPress={() => router.back()} variant="text" disabled={isSubmitting} />
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
