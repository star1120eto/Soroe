import auth from '@react-native-firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ListItem } from '@soroe/shared';

import {
  Banner,
  Button,
  Colors,
  Input,
  ListRow,
  Spacing,
  Typography,
  useAppFonts,
} from '@/design-system';
import {
  addListItem,
  setListItemCompletion,
  softDeleteListItem,
  subscribeToListItems,
  updateListItem,
  type ListItemsSnapshot,
} from '@/features/lists/ListRepository';

// SPIKE-001(実機2台のオフライン同期PoC)の検証用画面。
// STACK-GATE-01の合格条件を目視で確認するために置いており、製品の画面ではない。
// 検証手順とシードは docs/spike-001-offline-sync.md を参照。
const SPIKE_LIST_ID = 'spike-001';

export default function OfflineSyncSpikeScreen() {
  const [fontsLoaded] = useAppFonts();
  const [uid, setUid] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ListItemsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    // 匿名ログイン。SPIKE-001はFirestoreの同期挙動の検証が目的で、
    // Cloud Functionsに依存するメールOTPはSparkプランでは本番デプロイできない。
    const unsubscribe = auth().onAuthStateChanged((user) => {
      if (user) {
        setUid(user.uid);
        return;
      }
      auth()
        .signInAnonymously()
        .catch((err: Error) => setError(`sign-in: ${err.message}`));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!uid) {
      return;
    }
    return subscribeToListItems(
      SPIKE_LIST_ID,
      setSnapshot,
      (err) => setError(`subscribe: ${err.message}`)
    );
  }, [uid]);

  const items = snapshot?.items ?? [];

  const addItem = useCallback(async () => {
    if (!uid || !draftName.trim()) {
      return;
    }
    // 末尾へ追加。中間挿入は隣接2件の中間値を使う(LIST-005で実装)。
    const nextSortOrder = items.length === 0 ? 1000 : items[items.length - 1].sortOrder + 1000;
    try {
      await addListItem(SPIKE_LIST_ID, uid, { name: draftName.trim() }, nextSortOrder);
      setDraftName('');
    } catch (err) {
      setError(`add: ${(err as Error).message}`);
    }
  }, [uid, draftName, items]);

  const renameToObserveConflict = useCallback((item: ListItem) => {
    // 同一項目を両端末から書き換え、Last Write Winsの収束を観測する。
    updateListItem(SPIKE_LIST_ID, item.id, {
      name: `${item.name}*${new Date().toISOString().slice(17, 23)}`,
    });
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[Typography.title, styles.text]}>SPIKE-001 オフライン同期</Text>

        {error ? <Banner message={error} variant="danger" /> : null}

        {snapshot?.hasPendingWrites ? (
          <Banner message="未同期の変更があります" variant="warning" />
        ) : null}
        {snapshot?.isFromCache && !snapshot.hasPendingWrites ? (
          <Banner message="キャッシュから表示中(オフライン)" variant="info" />
        ) : null}
        {snapshot && !snapshot.isFromCache && !snapshot.hasPendingWrites ? (
          <Banner message="同期済み" variant="info" />
        ) : null}

        <Text style={[Typography.caption, styles.meta]}>uid: {uid ?? '(サインイン中)'}</Text>
        <Text style={[Typography.caption, styles.meta]}>
          items: {items.length} / pendingWrites: {String(snapshot?.hasPendingWrites ?? false)} /
          fromCache: {String(snapshot?.isFromCache ?? false)}
        </Text>

        <Input
          placeholder="項目名を入力"
          value={draftName}
          onChangeText={setDraftName}
          editable={uid !== null}
        />
        <Button label="項目を追加" onPress={addItem} disabled={uid === null} />

        <Text style={[Typography.heading, styles.text]}>項目</Text>
        {items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <ListRow
              label={item.name}
              checked={item.completedAt !== null}
              onChange={(checked) =>
                uid ? setListItemCompletion(SPIKE_LIST_ID, item.id, uid, checked) : undefined
              }
              meta={item.completedBy ? `完了: ${item.completedBy.slice(0, 6)}` : undefined}
            />
            <View style={styles.itemActions}>
              <Button
                label="改名(LWW観測)"
                onPress={() => renameToObserveConflict(item)}
                variant="secondary"
              />
              <Button
                label="論理削除"
                onPress={() => softDeleteListItem(SPIKE_LIST_ID, item.id)}
                variant="destructive"
              />
            </View>
          </View>
        ))}
      </ScrollView>
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
  text: {
    color: Colors.textPrimary,
  },
  meta: {
    color: Colors.textSecondary,
  },
  itemRow: {
    gap: Spacing[2],
    paddingBottom: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemActions: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
});
