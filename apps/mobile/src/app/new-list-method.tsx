import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Colors, Spacing, Typography } from '@/design-system';

// LIST-02: 空/テンプレート/AIの3方式。テンプレートとAIは専用の作成フローが
// 未実装(TMPL-001/AI-*)のため、それぞれのタブ画面へ暫定的に遷移する。
export default function NewListMethodScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={[Typography.title, styles.title]}>作成方法を選ぶ</Text>

        <Button label="空のリストから" onPress={() => router.push('/new-list')} />
        <Button
          label="テンプレートから"
          onPress={() => router.push('/templates')}
          variant="secondary"
        />
        <Button label="AIで作る" onPress={() => router.push('/ai')} variant="secondary" />
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
    gap: Spacing[3],
  },
  title: {
    color: Colors.textPrimary,
  },
});
