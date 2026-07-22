import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, EmptyState } from '@/design-system';

// Placeholder for LIST-002 (リスト一覧、空状態、作成方法選択、作成・編集).
export default function ListScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <EmptyState
        title="リストがありません"
        description="最初のリストを作成しましょう"
        actionLabel="作成する"
        onAction={() => router.push('/new-list')}
      />
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
