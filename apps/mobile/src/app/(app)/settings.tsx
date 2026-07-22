import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Colors, Spacing, Typography } from '@/design-system';
import { useSession } from '@/features/session/SessionProvider';

// Placeholder for AUTH-006 (認証方法の追加・解除) and later profile/settings screens.
export default function SettingsScreen() {
  const { signOutForDev } = useSession();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={[Typography.title, styles.title]}>設定</Text>
        <Button label="ログアウトする(開発用)" onPress={signOutForDev} variant="secondary" />
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
});
