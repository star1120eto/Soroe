import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { List, ListItem, ListMember } from '@soroe/shared';

import { Banner, Button, Checkbox, Chip, Colors, Input, Skeleton, Spacing, Typography } from '@/design-system';
import { formatDueDateInput } from '@/features/lists/dueDate';
import { validateItemEditForm, type ItemEditFormState } from '@/features/lists/itemEditForm';
import {
  setListItemCompletion,
  softDeleteListItem,
  subscribeToList,
  subscribeToListItem,
  subscribeToListMembers,
  updateListItem,
} from '@/features/lists/ListRepository';
import { useSession } from '@/features/session/SessionProvider';

const EMPTY_FORM: ItemEditFormState = {
  name: '',
  quantity: '',
  unit: '',
  category: '',
  note: '',
  assigneeId: null,
  dueAt: '',
};

function formFromItem(item: ListItem): ItemEditFormState {
  return {
    name: item.name,
    quantity: item.quantity !== null ? String(item.quantity) : '',
    unit: item.unit ?? '',
    category: item.category ?? '',
    note: item.note ?? '',
    assigneeId: item.assigneeId,
    dueAt: formatDueDateInput(item.dueAt),
  };
}

// ITEM-01: 項目編集。種別に応じて数量・単位(買い物・持ち物)、期限(やること)を
// 出し分け、保存時に編集開始時からの更新有無を比較して競合を確認する。
export default function ItemEditScreen() {
  const router = useRouter();
  const { listId, itemId } = useLocalSearchParams<{ listId: string; itemId: string }>();
  const { profile } = useSession();
  const uid = profile!.uid;

  const [list, setList] = useState<List | null | undefined>(undefined);
  const [item, setItem] = useState<ListItem | null | undefined>(undefined);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [form, setForm] = useState<ItemEditFormState>(EMPTY_FORM);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const initializedRef = useRef(false);
  const baseUpdatedAtRef = useRef<number | null>(null);

  useEffect(() => subscribeToList(listId, setList, () => setList(null)), [listId]);

  useEffect(
    () =>
      subscribeToListItem(
        listId,
        itemId,
        (next) => {
          setItem(next);
          if (next && !initializedRef.current) {
            initializedRef.current = true;
            baseUpdatedAtRef.current = next.updatedAt;
            setForm(formFromItem(next));
            setCompleted(next.completedAt !== null);
          }
        },
        () => setItem(null)
      ),
    [listId, itemId]
  );

  useEffect(
    () =>
      subscribeToListMembers(listId, setMembers, () => {
        /* 担当者選択の表示専用データのため、失敗しても画面は継続する */
      }),
    [listId]
  );

  const showQuantityUnit = list?.type === 'shopping' || list?.type === 'packing';
  const showDueDate = list?.type === 'task';

  const applySave = () => {
    if (!item) {
      return;
    }
    const result = validateItemEditForm(form, showQuantityUnit, showDueDate);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setIsSaving(true);
    updateListItem(listId, itemId, result.input);
    if (completed !== (item.completedAt !== null)) {
      setListItemCompletion(listId, itemId, uid, completed);
    }
    baseUpdatedAtRef.current = item.updatedAt;
    setIsSaving(false);
    router.back();
  };

  const handleSave = () => {
    setError(null);
    if (!item) {
      return;
    }
    if (baseUpdatedAtRef.current !== null && item.updatedAt !== baseUpdatedAtRef.current) {
      Alert.alert('他のメンバーが更新しました', 'この項目は編集中に別の変更が保存されました。', [
        {
          text: '相手の変更を使う',
          onPress: () => {
            baseUpdatedAtRef.current = item.updatedAt;
            setForm(formFromItem(item));
            setCompleted(item.completedAt !== null);
          },
        },
        { text: '自分の変更で上書き', style: 'destructive', onPress: applySave },
      ]);
      return;
    }
    applySave();
  };

  const handleDelete = () => {
    Alert.alert('この項目を削除しますか？', undefined, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: () => {
          softDeleteListItem(listId, itemId);
          router.back();
        },
      },
    ]);
  };

  if (list === null || item === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Banner message="項目を読み込めませんでした" variant="danger" />
      </SafeAreaView>
    );
  }

  if (list === undefined || item === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Banner message={error} variant="danger" /> : null}

        <Input
          placeholder="項目名"
          value={form.name}
          onChangeText={(name) => setForm((current) => ({ ...current, name }))}
          autoFocus
          accessibilityLabel="項目名"
        />

        {showQuantityUnit ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Input
                placeholder="数量"
                value={form.quantity}
                onChangeText={(quantity) => setForm((current) => ({ ...current, quantity }))}
                keyboardType="decimal-pad"
                accessibilityLabel="数量"
              />
            </View>
            <View style={styles.flex}>
              <Input
                placeholder="単位(個・本など)"
                value={form.unit}
                onChangeText={(unit) => setForm((current) => ({ ...current, unit }))}
                accessibilityLabel="単位"
              />
            </View>
          </View>
        ) : null}

        <Input
          placeholder="カテゴリ(任意)"
          value={form.category}
          onChangeText={(category) => setForm((current) => ({ ...current, category }))}
          accessibilityLabel="カテゴリ"
        />

        <Input
          placeholder="メモ(任意・500文字まで)"
          value={form.note}
          onChangeText={(note) => setForm((current) => ({ ...current, note }))}
          multiline
          accessibilityLabel="メモ"
        />

        {showDueDate ? (
          <Input
            placeholder="期限(YYYY-MM-DD、任意)"
            value={form.dueAt}
            onChangeText={(dueAt) => setForm((current) => ({ ...current, dueAt }))}
            accessibilityLabel="期限"
          />
        ) : null}

        <View style={styles.optionGroup}>
          <Text style={[Typography.label, styles.groupLabel]}>担当者</Text>
          <View style={styles.rowWrap}>
            <Chip
              label="未割当"
              variant={form.assigneeId === null ? 'selected' : 'default'}
              onPress={() => setForm((current) => ({ ...current, assigneeId: null }))}
            />
            {members.map((member) => (
              <Chip
                key={member.uid}
                label={member.uid === uid ? '自分' : 'メンバー'}
                variant={form.assigneeId === member.uid ? 'selected' : 'default'}
                onPress={() => setForm((current) => ({ ...current, assigneeId: member.uid }))}
              />
            ))}
          </View>
        </View>

        <View style={styles.completedRow}>
          <Checkbox checked={completed} onChange={setCompleted} />
          <Text style={[Typography.body, styles.completedLabel]}>完了にする</Text>
        </View>

        <Button label="保存する" onPress={handleSave} loading={isSaving} variant="primary" />
        <Button label="この項目を削除" onPress={handleDelete} variant="destructive" />
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
    gap: Spacing[4],
  },
  row: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  flex: {
    flex: 1,
  },
  optionGroup: {
    gap: Spacing[2],
  },
  groupLabel: {
    color: Colors.textSecondary,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 48,
  },
  completedLabel: {
    color: Colors.textPrimary,
  },
});
