import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Colors, Input, Spacing } from '@/design-system';

// Placeholder for LIST-002 (作成方法選択、作成・編集). Demonstrates the
// Stack modal presentation pattern requested by NAV-001.
export default function NewListModal() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Input placeholder="リスト名を入力" autoFocus />
        <Button label="作成する" onPress={() => router.back()} variant="primary" />
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
});
