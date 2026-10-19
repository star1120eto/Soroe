import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CreateListItemInput, List, ListItem, ListMember, UpdateListItemInput } from '@soroe/shared';

import { Banner, Button, Checkbox, Chip, Colors, Input, Skeleton, Spacing, Typography } from '@/design-system';
import { formatDueDateInput } from '@/features/lists/dueDate';
import { validateItemEditForm, type ItemEditFormState } from '@/features/lists/itemEditForm';
import {
  formatConflictMessage,
  resolveSave,
  toEditableValues,
  type EditableField,
  type EditableValues,
} from '@/features/lists/itemConflict';
import {
  addListItem,
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

  const [list, setList] = useState<List | null | undefined>(undefined);
  const [item, setItem] = useState<ListItem | null | undefined>(undefined);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [form, setForm] = useState<ItemEditFormState>(EMPTY_FORM);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 編集中に他の端末で削除された(削除を優先する。SYNC-01)。
  const [deleted, setDeleted] = useState(false);

  const initializedRef = useRef(false);
  // 自分の削除操作では「削除されました」画面を出さない(購読は手元の書込でも即座にnullを返す)。
  const deletingRef = useRef(false);
  // 編集を開いた時点の項目(競合判定の基準)と、最後に見えていた項目(削除後の新規追加の並び順に使う)。
  const baseRef = useRef<EditableValues | null>(null);
  const lastItemRef = useRef<ListItem | null>(null);

  useEffect(() => {
    if (!listId) {
      return;
    }
    return subscribeToList(listId, setList, () => setList(null));
  }, [listId]);

  useEffect(() => {
    if (!listId || !itemId) {
      return;
    }
    return subscribeToListItem(
      listId,
      itemId,
      (next) => {
        if (next === null && initializedRef.current) {
          if (!deletingRef.current) {
            setDeleted(true);
          }
          return;
        }
        setItem(next);
        if (next) {
          lastItemRef.current = next;
        }
        if (next && !initializedRef.current) {
          initializedRef.current = true;
          baseRef.current = toEditableValues(next);
          setForm(formFromItem(next));
          setCompleted(next.completedAt !== null);
        }
      },
      () => setItem(null)
    );
  }, [listId, itemId]);

  useEffect(() => {
    if (!listId) {
      return;
    }
    return subscribeToListMembers(listId, setMembers, () => {
      /* 担当者選択の表示専用データのため、失敗しても画面は継続する */
    });
  }, [listId]);

  const showQuantityUnit = list?.type === 'shopping' || list?.type === 'packing';
  const showDueDate = list?.type === 'task';
  // アーカイブ中は読み取り専用(LIST-05)。通常はlist/[listId].tsx側で
  // この画面へ遷移させないが、開いたまま他端末でアーカイブされる競合に
  // 備えて保存・削除もここで防ぐ(実際の拒否はfirestore.rulesが行う)。
  const isReadOnly = list != null && list.archivedAt !== null;

  // item-editも認証済みグループ(app)の外にモーダルとして登録しているため、
  // Universal Link等で未認証状態のまま開かれ得る。フックは全て上で
  // 呼び終えているので、ここでのみ早期returnする。
  if (!profile) {
    return <Redirect href="/" />;
  }
  const uid = profile.uid;

  // フォームの入力を検証し、競合判定用の値(EditableValues)と保存用の入力にそろえる。
  const readForm = (): { values: EditableValues; input: UpdateListItemInput } | null => {
    const result = validateItemEditForm(form, showQuantityUnit, showDueDate);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    const { input } = result;
    return {
      input,
      values: {
        name: input.name ?? '',
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        category: input.category ?? null,
        note: input.note ?? null,
        assigneeId: input.assigneeId ?? null,
        dueAt: input.dueAt ?? null,
        completed,
      },
    };
  };

  // 自分が変えた項目だけを書く。他のメンバーが別の項目を変えていても消さない(SYNC-01)。
  const applySave = (input: UpdateListItemInput, fields: EditableField[], nextBase: EditableValues) => {
    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      if (field !== 'completed') {
        patch[field] = input[field];
      }
    }
    if (Object.keys(patch).length > 0) {
      updateListItem(listId, itemId, patch as UpdateListItemInput);
    }
    if (fields.includes('completed')) {
      setListItemCompletion(listId, itemId, uid, nextBase.completed);
    }
    router.back();
  };

  const handleSave = () => {
    setError(null);
    if (!item || isReadOnly || !baseRef.current) {
      return;
    }
    const read = readForm();
    if (!read) {
      return;
    }
    const resolution = resolveSave({ base: baseRef.current, mine: read.values, latest: item });
    if (resolution.action === 'noop') {
      router.back();
      return;
    }
    if (resolution.action === 'deleted') {
      setDeleted(true);
      return;
    }
    if (resolution.action === 'save') {
      applySave(read.input, resolution.fields, read.values);
      return;
    }
    // 同じ項目が食い違うときだけ、比較して選ばせる。
    const latest = toEditableValues(item);
    Alert.alert('他のメンバーが更新しました', formatConflictMessage(resolution.overlapping, read.values, latest), [
      {
        text: '相手の変更を使う',
        onPress: () => {
          // 自分が変えていない項目と、食い違った項目は相手の値にそろえる(自分だけが変えた項目は残す)。
          const keep = resolution.fields.filter((field) => !resolution.overlapping.includes(field));
          const latestForm = formFromItem(item);
          setForm((current) => {
            const next = { ...latestForm };
            for (const field of keep) {
              if (field !== 'completed') {
                (next as Record<string, unknown>)[field] = current[field];
              }
            }
            return next;
          });
          if (!keep.includes('completed')) {
            setCompleted(latest.completed);
          }
          baseRef.current = latest;
        },
      },
      {
        text: '自分の変更で上書き',
        style: 'destructive',
        onPress: () => applySave(read.input, resolution.fields, read.values),
      },
    ]);
  };

  // 削除された項目の入力内容を、新しい項目として追加し直す(削除を優先したうえで、入力を失わせない)。
  const handleAddAsNew = () => {
    const read = readForm();
    if (!read || !lastItemRef.current) {
      return;
    }
    addListItem(listId, uid, { ...read.input, name: read.values.name } as CreateListItemInput, lastItemRef.current.sortOrder + 1);
    router.back();
  };

  const handleDelete = () => {
    if (isReadOnly) {
      return;
    }
    Alert.alert('この項目を削除しますか？', undefined, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: () => {
          deletingRef.current = true;
          softDeleteListItem(listId, itemId);
          router.back();
        },
      },
    ]);
  };

  if (deleted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Banner message="この項目は削除されました" variant="warning" />
          {error ? <Banner message={error} variant="danger" /> : null}
          <Button label="入力内容を新しい項目として追加" onPress={handleAddAsNew} variant="primary" />
          <Button label="閉じる" onPress={() => router.back()} variant="secondary" />
        </ScrollView>
      </SafeAreaView>
    );
  }

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
        {isReadOnly ? (
          <Banner message="アーカイブ中のため編集できません。アクティブに戻してください。" variant="warning" />
        ) : null}

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
          <Checkbox
            checked={completed}
            onChange={setCompleted}
          />
          <Text style={[Typography.body, styles.completedLabel]}>完了にする</Text>
        </View>

        <Button label="保存する" onPress={handleSave} disabled={isReadOnly} variant="primary" />
        <Button label="この項目を削除" onPress={handleDelete} disabled={isReadOnly} variant="destructive" />
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
