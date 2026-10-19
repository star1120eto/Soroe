import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { MyTemplate } from '@soroe/shared';

import { Banner, Button, Colors, Input, Spacing, Typography } from '@/design-system';

import { deleteMyTemplate, removeMyTemplateItems, renameMyTemplate } from './TemplateRepository';

type Props = {
  uid: string;
  template: MyTemplate;
  /** 削除が終わったとき(画面を閉じる)。 */
  onDeleted: () => void;
};

// MYTM-01: マイテンプレートの名前・説明の変更、項目を外す、削除。どれも本人のFirestore書込で、
// オフラインでも使える(Rulesが項目を増やす更新を拒否する)。
export function MyTemplateManager({ uid, template, onDeleted }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description ?? '');
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setTitle(template.title);
    setDescription(template.description ?? '');
    setRemoved(new Set());
    setError(null);
    setEditing(true);
  };

  const toggleRemoved = (id: string) =>
    setRemoved((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const save = () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 1 || trimmedTitle.length > 60) {
      setError('テンプレート名を1〜60文字で入力してください');
      return;
    }
    const nextDescription = description.trim() === '' ? null : description.trim();
    const remaining = template.items.filter((item) => !removed.has(item.id));
    if (remaining.length < 1) {
      setError('項目を1つ以上残してください');
      return;
    }

    if (trimmedTitle !== template.title || nextDescription !== template.description) {
      renameMyTemplate(uid, template.id, { title: trimmedTitle, description: nextDescription });
    }
    if (removed.size > 0) {
      removeMyTemplateItems(uid, template.id, remaining);
    }
    setEditing(false);
  };

  const confirmDelete = () =>
    Alert.alert('テンプレートを削除しますか？', `「${template.title}」を削除します。作成済みのリストは変わりません。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: () => {
          deleteMyTemplate(uid, template.id);
          onDeleted();
        },
      },
    ]);

  if (!editing) {
    return (
      <View style={styles.container}>
        <Button label="編集する" onPress={startEditing} variant="secondary" />
        <Button label="テンプレートを削除" onPress={confirmDelete} variant="destructive" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? <Banner message={error} variant="danger" /> : null}
      <Input placeholder="テンプレート名" value={title} onChangeText={setTitle} maxLength={60} accessibilityLabel="テンプレート名" />
      <Input
        placeholder="説明(任意)"
        value={description}
        onChangeText={setDescription}
        maxLength={200}
        multiline
        accessibilityLabel="説明(任意)"
      />
      <Text style={[Typography.label, styles.secondary]}>項目を外す</Text>
      {template.items.map((item) => {
        const isRemoved = removed.has(item.id);
        return (
          <View key={item.id} style={styles.itemRow}>
            <Text style={[Typography.body, styles.itemName, isRemoved && styles.removed]}>{item.name}</Text>
            <Button
              label={isRemoved ? `${item.name}を戻す` : `${item.name}を外す`}
              onPress={() => toggleRemoved(item.id)}
              variant="secondary"
            />
          </View>
        );
      })}
      <Button label="変更を保存" onPress={save} variant="primary" />
      <Button label="キャンセル" onPress={() => setEditing(false)} variant="text" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[3],
  },
  secondary: {
    color: Colors.textSecondary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  itemName: {
    flex: 1,
    color: Colors.textPrimary,
  },
  removed: {
    color: Colors.textSecondary,
    textDecorationLine: 'line-through',
  },
});
