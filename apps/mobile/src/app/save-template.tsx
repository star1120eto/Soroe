import { randomUUID } from 'expo-crypto';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveMyTemplateRequestSchema } from '@soroe/shared';

import { Banner, Button, Colors, ErrorState, Input, Spacing, Typography } from '@/design-system';
import { useConnectivity } from '@/features/connectivity/ConnectivityProvider';
import { OFFLINE_REQUIRED_MESSAGE } from '@/features/connectivity/offlineMessages';
import { subscribeToList } from '@/features/lists/ListRepository';
import { useSession } from '@/features/session/SessionProvider';
import { saveMyTemplate } from '@/features/templates/TemplateRepository';
import { describeTemplateError } from '@/features/templates/templateErrors';

// MYTM-02: リストをマイテンプレートとして保存する。項目と初期チェック状態だけを保存し、共有メンバー・
// 担当者・履歴は保存しない。上限(Free 1件)と冪等性の判定はFunctions(オンライン必須)。
export default function SaveTemplateScreen() {
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const { profile } = useSession();
  const { isOffline } = useConnectivity();

  const [title, setTitle] = useState<string | null>(null); // null = まだ入力していない(リスト名を初期値にする)
  const [listName, setListName] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => randomUUID());

  useEffect(() => {
    if (!listId) {
      return;
    }
    return subscribeToList(
      listId,
      (list) => setListName(list?.name ?? null),
      () => setListName(null)
    );
  }, [listId]);

  if (!profile) {
    return <Redirect href="/" />;
  }

  const currentTitle = title ?? listName ?? '';

  const submit = async () => {
    setValidationError(null);
    setRequestError(null);
    const parsed = saveMyTemplateRequestSchema.safeParse({
      listId,
      title: currentTitle,
      description: description.trim() === '' ? null : description,
      requestId,
    });
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues.some((issue) => issue.path[0] === 'description')
          ? '説明は200文字以内で入力してください'
          : 'テンプレート名を1〜60文字で入力してください'
      );
      return;
    }

    setBusy(true);
    try {
      await saveMyTemplate(parsed.data);
      router.dismissTo('/templates');
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'resource-exhausted') {
        setLimitReached(true);
      } else {
        setRequestError(describeTemplateError(error, 'save'));
      }
    } finally {
      setBusy(false);
    }
  };

  // Freeの2件目。課金導線(Premium)はEPIC-08で追加する。ここでは既存のテンプレートの確認へ誘導する。
  if (limitReached) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState title="これ以上保存できません" description={describeTemplateError({ code: 'resource-exhausted' }, 'save')} />
        <View style={styles.content}>
          <Button label="既存のテンプレートを確認する" onPress={() => router.dismissTo('/templates')} variant="primary" />
          <Button label="後で" onPress={() => router.back()} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        {requestError ? <Banner message={requestError} variant="danger" /> : null}
        {isOffline ? <Banner message={OFFLINE_REQUIRED_MESSAGE} variant="warning" /> : null}
        <Text style={[Typography.body, styles.secondary]}>
          現在の項目と初期チェック状態を保存します。共有メンバーや担当者、完了の履歴は保存されません。
        </Text>
        <Input
          placeholder="テンプレート名"
          value={currentTitle}
          onChangeText={setTitle}
          maxLength={60}
          errorMessage={validationError ?? undefined}
          accessibilityLabel="テンプレート名"
        />
        <Input
          placeholder="説明(任意)"
          value={description}
          onChangeText={setDescription}
          maxLength={200}
          multiline
          accessibilityLabel="説明(任意)"
        />
        <Button label="保存する" onPress={submit} loading={busy} disabled={isOffline || busy} variant="primary" />
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
  secondary: {
    color: Colors.textSecondary,
  },
});
