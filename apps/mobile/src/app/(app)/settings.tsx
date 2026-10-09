import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Chip, Colors, Spacing, Typography } from '@/design-system';
import { useSession } from '@/features/session/SessionProvider';

// 言語を切り替えられる設定画面。AUTH-006(認証方法の追加・解除)など他の設定は今後ここへ足す。
export default function SettingsScreen() {
  const { profile, setLanguage, signOut } = useSession();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const changeLanguage = async (language: 'ja' | 'en') => {
    if (isSaving || profile?.language === language) {
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      await setLanguage(language);
    } catch {
      setSaveError('言語を変更できませんでした。時間をおいてお試しください');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={[Typography.title, styles.title]}>設定</Text>
        {profile ? (
          <Text style={[Typography.body, styles.profileName]}>{profile.displayName}</Text>
        ) : null}

        {saveError ? <Banner message={saveError} variant="danger" /> : null}

        <Text style={[Typography.label, styles.label]}>言語</Text>
        <View style={styles.languageRow}>
          <Chip
            label="日本語"
            variant={profile?.language === 'ja' ? 'selected' : 'default'}
            onPress={() => changeLanguage('ja')}
          />
          <Chip
            label="English"
            variant={profile?.language === 'en' ? 'selected' : 'default'}
            onPress={() => changeLanguage('en')}
          />
        </View>

        <Button label="ログアウト" onPress={signOut} variant="secondary" />
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
  title: {
    color: Colors.textPrimary,
  },
  profileName: {
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
