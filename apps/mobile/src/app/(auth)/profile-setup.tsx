import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { userProfileSchema } from '@soroe/shared';

import { Banner, Button, Chip, Colors, Input, Spacing, Typography } from '@/design-system';
import { useSession } from '@/features/session/SessionProvider';

// soroe-functional-specification.md AUTH-03: 表示名必須1〜30文字、言語は日英。
// 家族構成は必須収集しない。
export default function ProfileSetupScreen() {
  const { createProfile } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [language, setLanguage] = useState<'ja' | 'en'>('ja');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    setValidationError(null);
    setSaveError(null);

    const parsed = userProfileSchema
      .pick({ displayName: true, language: true })
      .safeParse({ displayName, language });
    if (!parsed.success) {
      setValidationError('表示名を1〜30文字で入力してください');
      return;
    }

    setIsSaving(true);
    try {
      // 保存後の遷移(招待復帰 or リスト一覧)はSessionProviderのstatus変化と
      // (app)/_layout.tsxの保留招待チェックが引き受ける。
      await createProfile(parsed.data);
    } catch {
      setSaveError('保存できませんでした。時間をおいてお試しください');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={[Typography.title, styles.title]}>プロフィールを設定</Text>
        <Text style={[Typography.body, styles.description]}>
          家族に表示される名前を決めてください
        </Text>

        {saveError ? <Banner message={saveError} variant="danger" /> : null}

        <Input
          placeholder="表示名"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={30}
          errorMessage={validationError ?? undefined}
          editable={!isSaving}
        />

        <Text style={[Typography.label, styles.label]}>言語</Text>
        <View style={styles.languageRow}>
          <Chip
            label="日本語"
            variant={language === 'ja' ? 'selected' : 'default'}
            onPress={() => setLanguage('ja')}
          />
          <Chip
            label="English"
            variant={language === 'en' ? 'selected' : 'default'}
            onPress={() => setLanguage('en')}
          />
        </View>

        <Button label="はじめる" onPress={submit} loading={isSaving} />
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
  label: {
    color: Colors.textPrimary,
  },
  languageRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
});
