import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createListInputSchema, type List, type ListType } from '@soroe/shared';

import { Banner, Button, Chip, Colors, Input, Spacing, Typography, type PhIconName } from '@/design-system';
import { LIST_COLOR_OPTIONS, LIST_TYPE_OPTIONS } from '@/features/lists/listOptions';
import { createList, subscribeToList, updateList } from '@/features/lists/ListRepository';

// LIST-03: 作成/編集を1フォームで扱う。listIdが無ければ新規作成、あれば
// 既存リストを購読して編集する(編集への実際の導線はLIST-003で追加される)。
export default function NewListScreen() {
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId?: string }>();
  const isEditing = Boolean(listId);

  const [requestId] = useState(() => randomUUID());
  const [name, setName] = useState('');
  const [type, setType] = useState<ListType>('shopping');
  const [icon, setIcon] = useState<PhIconName>(LIST_TYPE_OPTIONS[0].icon);
  const [colorToken, setColorToken] = useState('primary');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!listId) {
      return;
    }
    return subscribeToList(
      listId,
      (list: List | null) => {
        if (!list) {
          return;
        }
        setName(list.name);
        setType(list.type);
        setColorToken(list.color);
        setIcon(list.icon as PhIconName);
      },
      () => setRequestError('リストを読み込めませんでした')
    );
  }, [listId]);

  const submit = async () => {
    setValidationError(null);
    setRequestError(null);

    const parsed = createListInputSchema.safeParse({ name, type, color: colorToken, icon });
    if (!parsed.success) {
      setValidationError('リスト名は1〜60文字で入力してください');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && listId) {
        updateList(listId, { name: parsed.data.name, color: colorToken, icon });
        router.back();
        return;
      }

      const created = await createList(parsed.data, requestId);
      router.dismissTo('/');
      void created;
    } catch (error) {
      const code = (error as { code?: string }).code;
      setRequestError(
        code === 'resource-exhausted'
          ? 'Freeプランで作成できるリストは3件までです'
          : '保存できませんでした。時間をおいてお試しください'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        {requestError ? <Banner message={requestError} variant="danger" /> : null}

        <Input
          placeholder="リスト名を入力"
          value={name}
          onChangeText={setName}
          autoFocus
          errorMessage={validationError ?? undefined}
          editable={!isSubmitting}
        />

        {!isEditing ? (
          <View style={styles.optionGroup}>
            <Text style={[Typography.label, styles.groupLabel]}>種別</Text>
            <View style={styles.rowWrap}>
              {LIST_TYPE_OPTIONS.map((option) => (
                <Chip
                  key={option.type}
                  label={option.label}
                  variant={option.type === type ? 'selected' : 'default'}
                  onPress={() => {
                    setType(option.type);
                    setIcon(option.icon);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.optionGroup}>
          <Text style={[Typography.label, styles.groupLabel]}>色</Text>
          <View style={styles.rowWrap}>
            {LIST_COLOR_OPTIONS.map((option) => (
              <Pressable
                key={option.token}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: option.token === colorToken }}
                onPress={() => setColorToken(option.token)}
                hitSlop={Spacing[2]}
                style={[
                  styles.swatch,
                  { backgroundColor: option.value },
                  option.token === colorToken && styles.swatchSelected,
                ]}
              />
            ))}
          </View>
        </View>

        <Button
          label={isEditing ? '保存する' : '作成する'}
          onPress={submit}
          loading={isSubmitting}
          variant="primary"
        />
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
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: Colors.textPrimary,
  },
});
