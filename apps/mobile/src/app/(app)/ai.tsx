import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, EmptyState } from '@/design-system';

// Placeholder for the AI list-generation EPIC (soroe-technology-stack-evaluation.md 7章).
export default function AiScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <EmptyState title="AI生成はまだありません" description="行き先やシーンを伝えるとリストを提案します" />
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
