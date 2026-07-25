import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Colors, Spacing, Typography } from '@/design-system';
import { useSession } from '@/features/session/SessionProvider';

// Placeholder for AUTH-006 (認証方法の追加・解除) and later profile/settings screens.
export default function SettingsScreen() {
  const { profile, signOut } = useSession();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={[Typography.title, styles.title]}>設定</Text>
        {profile ? (
          <Text style={[Typography.body, styles.profileName]}>{profile.displayName}</Text>
        ) : null}
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
});
