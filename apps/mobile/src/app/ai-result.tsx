import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AiRating, ListType } from '@soroe/shared';

import { Banner, Button, Checkbox, Chip, Colors, Input, Skeleton, Spacing, Typography } from '@/design-system';
import { cancelGeneration, rateAiResult, saveAiResult, subscribeToAiRequest, type AiRequestView } from '@/features/ai/AiRepository';
import { describeAiError, describeGenerateOutcome } from '@/features/ai/aiMessages';
import { subscribeToOutcome, type AiOutcome } from '@/features/ai/aiOutcomes';
import {
  addItem,
  canSave,
  editItem,
  removeItem,
  selectedCount,
  setListType,
  setTitle,
  toEditable,
  toSaveRequest,
  toggleItem,
  type EditableResult,
} from '@/features/ai/aiResultEdit';
import { clearPendingAiRequest } from '@/features/ai/pendingAiRequest';
import { useConnectivity } from '@/features/connectivity/ConnectivityProvider';
import { OFFLINE_REQUIRED_MESSAGE } from '@/features/connectivity/offlineMessages';
import { useSession } from '@/features/session/SessionProvider';

const LIST_TYPES: { value: ListType; label: string }[] = [
  { value: 'shopping', label: '買い物' },
  { value: 'packing', label: '持ち物' },
  { value: 'task', label: 'やること' },
];
const PRIORITY_LABEL = { essential: '必須', 'nice-to-have': 'あると便利' } as const;
const AI_NOTICE = 'AIが作成した内容です。実際の状況に合わせて、必ず内容を確認してください';
const SAFETY_NOTICE = '登山・防災・医療などは、専門機関の最新情報を確認してください。この内容は安全を保証するものではありません';
const LIST_LIMIT_MESSAGE = 'Freeプランで利用できるリストは3件までです。既存のリストをアーカイブしてから、もう一度保存してください';

// AI-04 / AI-05: 生成の状態(生成中・結果・失敗)を requestId で表示する。結果は選択解除・追加・編集・削除、
// タイトル・種別の変更ができ、保存はサーバーでリスト上限を判定する。アプリを開き直しても、aiRequests の購読から
// 状態と結果を復元する。上限・生成中など文書が作られない応答は、生成の呼び出しの応答(aiOutcomes)から表示する。
export default function AiResultScreen() {
  const router = useRouter();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { profile } = useSession();
  const { isOffline } = useConnectivity();

  const [request, setRequest] = useState<AiRequestView | null>(null);
  const [outcome, setOutcome] = useState<AiOutcome | null>(null);
  const [editedState, setEditedState] = useState<EditableResult | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [rating, setRating] = useState<AiRating | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const uid = profile?.uid ?? null;

  useEffect(() => {
    if (!uid || !requestId) {
      return;
    }
    const unsubscribeRequest = subscribeToAiRequest(uid, requestId, setRequest, () => setMessage('生成の状態を読み込めませんでした'));
    const unsubscribeOutcome = subscribeToOutcome(requestId, setOutcome);
    return () => {
      unsubscribeRequest();
      unsubscribeOutcome();
    };
  }, [uid, requestId]);

  const finished = request?.status === 'failed' || request?.status === 'refused' || request?.status === 'cancelled';
  // 結果が出なかった生成は、「前回の結果を見る」の対象から外す。
  useEffect(() => {
    if (finished) {
      void clearPendingAiRequest();
    }
  }, [finished]);

  if (!profile) {
    return <Redirect href="/" />;
  }

  // 結果の編集内容は、最初は購読で来た結果から作り、以後は編集で置き換える(effectでstateを書き換えない)。
  const base = request?.result && (request.status === 'succeeded' || request.status === 'saved') ? request.result : null;
  const editable = editedState ?? (base ? toEditable(base) : null);
  const edit = (change: (current: EditableResult) => EditableResult) => {
    if (editable) {
      setEditedState(change(editable));
    }
  };

  const retry = async () => {
    await clearPendingAiRequest();
    router.replace('/ai-flow');
  };

  const save = async () => {
    if (!editable || !canSave(editable)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await saveAiResult(toSaveRequest(requestId, editable));
      if (response.status === 'saved') {
        await clearPendingAiRequest();
        router.replace(`/list/${response.listId}`);
      } else if (response.status === 'limit-reached') {
        setMessage(LIST_LIMIT_MESSAGE);
      } else {
        setMessage('生成結果が見つかりません');
      }
    } catch (error) {
      setMessage(describeAiError(error));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    try {
      await cancelGeneration({ requestId });
      await clearPendingAiRequest();
    } catch (error) {
      setMessage(describeAiError(error));
    }
  };

  const rate = (value: AiRating) => {
    setRating(value);
    rateAiResult({ requestId, rating: value }).catch((error) => setMessage(describeAiError(error)));
  };

  const discard = async () => {
    await clearPendingAiRequest();
    router.back();
  };

  // ---- 状態ごとの表示 ----

  if (request?.status === 'reserved') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
        <View style={styles.content}>
          {message ? <Banner message={message} variant="danger" /> : null}
          <Banner message="生成しています。しばらくお待ちください" variant="info" />
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
          <Button label="キャンセル" onPress={cancel} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  if (finished) {
    const text =
      request?.status === 'cancelled'
        ? '生成をキャンセルしました'
        : (request?.message ?? '生成に失敗しました。時間をおいてもう一度お試しください');
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
        <View style={styles.content}>
          <Banner message={text} variant={request?.status === 'cancelled' ? 'info' : 'warning'} />
          <Button label="条件を直してやり直す" onPress={retry} variant="primary" />
        </View>
      </SafeAreaView>
    );
  }

  if (!editable) {
    // 文書がまだ無い(または作られなかった)場合。呼び出しの応答があればその内容を出す。
    const outcomeMessage =
      outcome?.kind === 'response' ? describeGenerateOutcome(outcome.response) : outcome?.kind === 'error' ? describeAiError(outcome.error) : null;
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
        <View style={styles.content}>
          {message ? <Banner message={message} variant="danger" /> : null}
          {outcomeMessage ? (
            <>
              <Banner message={outcomeMessage} variant="warning" />
              <Button label="戻る" onPress={retry} variant="secondary" />
            </>
          ) : (
            <>
              <Banner message="生成を準備しています" variant="info" />
              <Skeleton width="100%" height={48} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const saved = request?.status === 'saved';
  const selected = selectedCount(editable);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        {message ? <Banner message={message} variant="danger" /> : null}
        {isOffline ? <Banner message={OFFLINE_REQUIRED_MESSAGE} variant="warning" /> : null}
        {saved ? <Banner message="保存しました" variant="info" /> : null}
        <Banner message={AI_NOTICE} variant="info" />
        {editable.safetyNotice ? <Banner message={SAFETY_NOTICE} variant="warning" /> : null}

        <Input
          placeholder="リスト名"
          value={editable.title}
          onChangeText={(title) => edit((current) => setTitle(current, title))}
          maxLength={60}
          accessibilityLabel="リスト名"
        />
        <View style={styles.wrap}>
          {LIST_TYPES.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              variant={editable.listType === option.value ? 'selected' : 'default'}
              onPress={() => edit((current) => setListType(current, option.value))}
            />
          ))}
        </View>

        <Text style={[Typography.label, styles.secondary]}>
          選択中 {selected}/{editable.items.length}件
        </Text>
        {editable.items.map((item) => (
          <View key={item.key} style={styles.itemRow}>
            <Pressable
              onPress={() => edit((current) => toggleItem(current, item.key))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.selected }}
              accessibilityLabel={item.name}
              hitSlop={Spacing[2]}>
              {/* 外側がチェックボックスのため、中のCheckboxは支援技術から隠す(二重に読み上げない)。 */}
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Checkbox checked={item.selected} onChange={() => edit((current) => toggleItem(current, item.key))} />
              </View>
            </Pressable>
            <View style={styles.itemBody}>
              <Input
                value={item.name}
                onChangeText={(name) => edit((current) => editItem(current, item.key, { name }))}
                maxLength={100}
                accessibilityLabel={`${item.name}の名前`}
              />
              <Text style={[Typography.caption, styles.secondary]}>
                {PRIORITY_LABEL[item.priority]}
                {item.quantity !== null ? ` ・ ${item.quantity}${item.unit ?? ''}` : ''}
              </Text>
              {item.reason ? <Text style={[Typography.caption, styles.secondary]}>{item.reason}</Text> : null}
            </View>
            <Button label={`${item.name}を削除`} onPress={() => edit((current) => removeItem(current, item.key))} variant="text" />
          </View>
        ))}

        <View style={styles.addRow}>
          <View style={styles.itemBody}>
            <Input placeholder="項目を追加" value={newItemName} onChangeText={setNewItemName} maxLength={100} accessibilityLabel="追加する項目" />
          </View>
          <Button
            label="追加"
            onPress={() => {
              edit((current) => addItem(current, newItemName));
              setNewItemName('');
            }}
            variant="secondary"
          />
        </View>

        {saved && request?.listId ? (
          <Button label="リストを開く" onPress={() => router.replace(`/list/${request.listId}`)} variant="primary" />
        ) : (
          <Button label="保存する" onPress={save} loading={busy} disabled={!canSave(editable) || isOffline || busy} variant="primary" />
        )}

        <View style={styles.group}>
          <Text style={[Typography.label, styles.secondary]}>この結果はどうでしたか?</Text>
          <View style={styles.wrap}>
            <Chip label="役に立った" variant={(rating ?? request?.rating) === 'helpful' ? 'selected' : 'default'} onPress={() => rate('helpful')} />
            <Chip label="足りなかった" variant={(rating ?? request?.rating) === 'insufficient' ? 'selected' : 'default'} onPress={() => rate('insufficient')} />
          </View>
        </View>

        {saved ? null : <Button label="破棄して戻る" onPress={discard} variant="text" />}
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
  group: {
    gap: Spacing[2],
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
  },
  itemBody: {
    flex: 1,
    gap: Spacing[1],
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
});
