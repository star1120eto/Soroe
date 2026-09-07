import { randomUUID } from 'expo-crypto';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AlertButton,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { List, ListItem, ListMember } from '@soroe/shared';

import {
  Banner,
  Checkbox,
  Chip,
  Colors,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Skeleton,
  Spacing,
  Typography,
} from '@/design-system';
import { describeListActionError } from '@/features/lists/listActionErrors';
import {
  addListItem,
  archiveList,
  deleteList,
  duplicateList,
  reorderListItem,
  setListItemCompletion,
  subscribeToList,
  subscribeToListItems,
  subscribeToListMembers,
  type ListItemsSnapshot,
} from '@/features/lists/ListRepository';
import {
  DEFAULT_ITEM_FILTERS,
  buildItemSections,
  filterListItems,
  formatItemMeta,
  hasDuplicateItemName,
  isItemFilterActive,
  moveItemSortOrder,
  nextAppendSortOrder,
  uniqueCategories,
  type ItemFilters,
} from '@/features/lists/itemSections';
import { parseQuickAddInput } from '@/features/lists/quickAddParser';
import { useSession } from '@/features/session/SessionProvider';

// itemsSnapshotがnullの間の`?? []`が毎レンダー新しい配列になり、それに依存する
// useMemoが無駄に再計算されるのを避けるための安定した既定値。
const EMPTY_ITEMS: ListItem[] = [];

// LIST-003/LIST-005/LIST-006: リスト詳細。購読、高速追加、チェック、
// フィルター・検索・手動並べ替え、リスト操作メニューをまとめて扱う。
export default function ListDetailScreen() {
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const { profile } = useSession();

  const [list, setList] = useState<List | null | undefined>(undefined);
  const [listError, setListError] = useState<string | null>(null);
  const [itemsSnapshot, setItemsSnapshot] = useState<ListItemsSnapshot | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [members, setMembers] = useState<ListMember[]>([]);

  const [quickAddText, setQuickAddText] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [filters, setFilters] = useState<ItemFilters>(DEFAULT_ITEM_FILTERS);
  const [reorderItemId, setReorderItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const quickAddRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!listId) {
      return;
    }
    return subscribeToList(
      listId,
      (next) => setList(next),
      () => setListError('リストを読み込めませんでした')
    );
  }, [listId]);

  useEffect(() => {
    if (!listId) {
      return;
    }
    return subscribeToListItems(
      listId,
      (snapshot) => setItemsSnapshot(snapshot),
      () => setItemsError('項目を読み込めませんでした')
    );
  }, [listId]);

  useEffect(() => {
    if (!listId) {
      return;
    }
    return subscribeToListMembers(
      listId,
      (next) => setMembers(next),
      () => {
        /* 担当者フィルターの表示専用データのため、失敗しても画面は継続する */
      }
    );
  }, [listId]);

  const items = itemsSnapshot?.items ?? EMPTY_ITEMS;
  const isOwner = list != null && profile != null && list.ownerId === profile.uid;
  const categories = useMemo(() => uniqueCategories(items), [items]);
  const filteredItems = useMemo(() => filterListItems(items, filters), [items, filters]);
  const sections = useMemo(
    () => buildItemSections(filteredItems, filters.onlyIncomplete),
    [filteredItems, filters.onlyIncomplete]
  );
  // アーカイブ中は読み取り専用(LIST-05)。firestore.rulesでも項目write全般を
  // 拒否しているため、これはUI上の案内であり実際の防御はサーバー側にある。
  const isReadOnly = list != null && list.archivedAt !== null;
  // 未完了のみ・検索・カテゴリ・担当者のいずれかで絞っている間、または
  // カテゴリ見出しや完了セクションで表示がグループ分けされている間は、
  // 可視順(セクションをまたいだ並び)とsortOrderの隣接関係が一致しなく
  // なるため手動並べ替えを無効にする。
  const canReorder = !isReadOnly && !isItemFilterActive(filters) && sections.length <= 1;
  // 並べ替え中にフィルターを変えてcanReorderがfalseになった場合に上下ボタンを
  // 出しっぱなしにしないよう、表示条件にもcanReorderを含める(reorderItemId
  // 自体はリセットしない。再度canReorderに戻れば続きから並べ替えられる)。
  const isReordering = canReorder && reorderItemId !== null;

  // list/[listId]は認証済みグループ(app)の外にも登録されているため
  // (モーダル遷移用)、Universal Link等で未認証状態のまま開かれ得る。
  // フックは全て上で呼び終えているので、ここでのみ早期returnする。
  if (!profile) {
    return <Redirect href="/" />;
  }
  const uid = profile.uid;

  const submitQuickAdd = () => {
    if (!list || isReadOnly || quickAddText.trim() === '') {
      return;
    }
    const parsed = parseQuickAddInput(quickAddText);
    setDuplicateWarning(hasDuplicateItemName(items, parsed.name) ? `「${parsed.name}」は既にリストにあります` : null);

    void addListItem(
      list.id,
      uid,
      { name: parsed.name, quantity: parsed.quantity, unit: parsed.unit },
      nextAppendSortOrder(items)
    );
    setQuickAddText('');
    quickAddRef.current?.focus();
  };

  const toggleComplete = (item: ListItem) => {
    if (!list || isReadOnly) {
      return;
    }
    setListItemCompletion(list.id, item.id, uid, item.completedAt === null);
  };

  const moveReorderingItem = (direction: 'up' | 'down') => {
    if (!list || !reorderItemId || !canReorder) {
      return;
    }
    const newSortOrder = moveItemSortOrder(items, reorderItemId, direction);
    if (newSortOrder === null) {
      return;
    }
    reorderListItem(list.id, reorderItemId, newSortOrder);
  };

  const openItemEdit = (item: ListItem) => {
    // reorderItemId(生の状態)ではなくisReorderingで見る。フィルターで
    // canReorderがfalseになった後もreorderItemIdだけ残ると、並べ替え
    // ボタンは消えるのに項目タップだけ塞がったままになってしまうため。
    if (isReordering || isReadOnly) {
      return; // 並べ替え中の誤タップでの遷移を防ぐ。アーカイブ中は読み取り専用。
    }
    router.push({ pathname: '/item-edit', params: { listId: list!.id, itemId: item.id } });
  };

  const runOwnerAction = async (action: () => Promise<unknown>, onSuccess: () => void) => {
    setActionError(null);
    try {
      await action();
      onSuccess();
    } catch (error) {
      setActionError(describeListActionError(error));
    }
  };

  const confirmDelete = () => {
    if (!list) {
      return;
    }
    Alert.alert(
      'リストを削除しますか？',
      `「${list.name}」を削除します。30日以内なら復元できます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () => runOwnerAction(() => deleteList(list.id), () => router.back()),
        },
      ]
    );
  };

  const openListMenu = () => {
    if (!list) {
      return;
    }
    const buttons: AlertButton[] = [
      {
        text: '複製する',
        onPress: () =>
          runOwnerAction(
            async () => {
              const result = await duplicateList(list.id, randomUUID());
              router.push(`/list/${result.listId}`);
            },
            () => {}
          ),
      },
    ];
    if (isOwner && !isReadOnly) {
      // リスト名・色・アイコンの直接更新はfirestore.rulesでオーナーのみに
      // 限定している(EPIC-04のSHARE実装まではeditorも保有者=自分のみだが、
      // 将来共有が増えても非オーナーの編集が黙って失敗しないようにする)。
      // アーカイブ中はRules側もresource.data.archivedAt==nullを要求して
      // おり(LIST-05の読み取り専用)、この操作を出しても保存が黙って
      // 拒否されるだけなのでメニューからも外す。
      buttons.unshift({
        text: 'リストを編集',
        onPress: () => router.push({ pathname: '/new-list', params: { listId: list.id } }),
      });
      buttons.push({
        text: 'アーカイブする',
        onPress: () => runOwnerAction(() => archiveList(list.id), () => router.back()),
      });
      buttons.push({ text: '削除する', style: 'destructive', onPress: confirmDelete });
    }
    buttons.push({ text: 'キャンセル', style: 'cancel' });
    Alert.alert(list.name, undefined, buttons);
  };

  if (listError || itemsError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState title="読み込みに失敗しました" description={listError ?? itemsError ?? undefined} />
      </SafeAreaView>
    );
  }

  if (list === undefined || itemsSnapshot === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
        </View>
      </SafeAreaView>
    );
  }

  if (list === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState title="リストが見つかりません" description="削除されたか、閲覧できない可能性があります" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: list.name,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="メニュー" onPress={openListMenu} hitSlop={Spacing[2]}>
              <Icon name="dots-three" color={Colors.textPrimary} size={24} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        <ScrollView contentContainerStyle={styles.content}>
          {actionError ? <Banner message={actionError} variant="danger" /> : null}
          {isReadOnly ? (
            <Banner message="アーカイブ中のため読み取り専用です。編集するにはアクティブに戻してください。" variant="warning" />
          ) : null}
          {itemsSnapshot.hasPendingWrites ? <Banner message="未同期の変更があります" variant="info" /> : null}
          {duplicateWarning ? <Banner message={duplicateWarning} variant="warning" /> : null}

          <Input
            placeholder="項目名で検索"
            value={filters.search}
            onChangeText={(text) => setFilters((current) => ({ ...current, search: text }))}
            accessibilityLabel="項目を検索"
          />

          <View style={styles.filterRow}>
            <Chip
              label="未完了のみ"
              variant={filters.onlyIncomplete ? 'selected' : 'default'}
              onPress={() => setFilters((current) => ({ ...current, onlyIncomplete: !current.onlyIncomplete }))}
            />
            {categories.map((category) => (
              <Chip
                key={category}
                label={category}
                variant={filters.category === category ? 'selected' : 'default'}
                onPress={() =>
                  setFilters((current) => ({
                    ...current,
                    category: current.category === category ? null : category,
                  }))
                }
              />
            ))}
            {members.length > 1
              ? members.map((member) => (
                  <Chip
                    key={member.uid}
                    label={member.uid === uid ? '自分' : 'メンバー'}
                    variant={filters.assigneeId === member.uid ? 'selected' : 'default'}
                    onPress={() =>
                      setFilters((current) => ({
                        ...current,
                        assigneeId: current.assigneeId === member.uid ? null : member.uid,
                      }))
                    }
                  />
                ))
              : null}
          </View>

          {sections.length === 0 ? (
            <EmptyState title="項目がありません" description="下の入力欄から追加できます" />
          ) : (
            sections.map((section) => (
              <View key={section.title ?? '__uncategorized__'} style={styles.section}>
                {section.title ? <Text style={[Typography.label, styles.sectionTitle]}>{section.title}</Text> : null}
                {section.items.map((item) => {
                  const meta = formatItemMeta(item, uid);
                  return (
                  <Pressable
                    key={item.id}
                    onPress={() => openItemEdit(item)}
                    onLongPress={() => canReorder && setReorderItemId((current) => (current === item.id ? null : item.id))}
                    delayLongPress={400}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}>
                    <View style={styles.itemRow}>
                      <Checkbox
                        checked={item.completedAt !== null}
                        onChange={() => toggleComplete(item)}
                        disabled={isReadOnly}
                      />
                      <Text
                        style={[
                          Typography.body,
                          styles.itemLabel,
                          item.completedAt !== null && styles.itemLabelDone,
                        ]}>
                        {item.name}
                      </Text>
                      {meta ? <Text style={[Typography.caption, styles.itemMeta]}>{meta}</Text> : null}
                    </View>
                    {isReordering && reorderItemId === item.id ? (
                      <View style={styles.reorderControls}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="上へ移動"
                          onPress={() => moveReorderingItem('up')}
                          hitSlop={Spacing[2]}
                          style={styles.reorderButton}>
                          <Icon name="caret-up" color={Colors.textPrimary} size={20} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="下へ移動"
                          onPress={() => moveReorderingItem('down')}
                          hitSlop={Spacing[2]}
                          style={styles.reorderButton}>
                          <Icon name="caret-down" color={Colors.textPrimary} size={20} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="並べ替えを終える"
                          onPress={() => setReorderItemId(null)}
                          hitSlop={Spacing[2]}
                          style={styles.reorderButton}>
                          <Icon name="x" color={Colors.textSecondary} size={20} />
                        </Pressable>
                      </View>
                    ) : null}
                  </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        {isReadOnly ? null : (
        <View style={styles.quickAddBar}>
          <TextInput
            ref={quickAddRef}
            style={[Typography.body, styles.quickAddInput]}
            placeholder="項目を追加(例: 牛乳 2本)"
            placeholderTextColor={Colors.textSecondary}
            value={quickAddText}
            onChangeText={setQuickAddText}
            onSubmitEditing={submitQuickAdd}
            returnKeyType="done"
            blurOnSubmit={false}
            accessibilityLabel="項目を追加"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="追加する"
            onPress={submitQuickAdd}
            hitSlop={Spacing[2]}
            style={styles.quickAddButton}>
            <Icon name="plus" color={Colors.surface} size={20} />
          </Pressable>
        </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing[5],
    gap: Spacing[3],
    paddingBottom: Spacing[6],
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  section: {
    gap: Spacing[1],
  },
  sectionTitle: {
    color: Colors.textSecondary,
    marginTop: Spacing[2],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    gap: Spacing[3],
  },
  itemLabel: {
    flex: 1,
    color: Colors.textPrimary,
  },
  itemLabelDone: {
    color: Colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  itemMeta: {
    color: Colors.textSecondary,
  },
  reorderControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing[4],
    paddingVertical: Spacing[1],
    paddingRight: Spacing[2],
  },
  reorderButton: {
    padding: Spacing[1],
  },
  quickAddBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    padding: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  quickAddInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing[4],
  },
  quickAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
