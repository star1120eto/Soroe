import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, EmptyState } from '@/design-system';

// Placeholder for a future EPIC (テンプレート一覧・マイテンプレート).
export default function TemplatesScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <EmptyState title="テンプレートがありません" description="よく使うリストをテンプレートとして保存できます" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },
});
