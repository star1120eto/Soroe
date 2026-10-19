import { randomUUID } from 'expo-crypto';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AiAgeBand, AiFeature, AiSeason, AiUseCase } from '@soroe/shared';

import { Banner, Button, Chip, Colors, Input, Spacing, Typography } from '@/design-system';
import { generateList, loadGenerationProfile, saveGenerationProfile } from '@/features/ai/AiRepository';
import { applyProfile, emptyDraft, toGenerationInput, toProfile, validateStep, type AiDraft } from '@/features/ai/aiDraft';
import { trackGeneration } from '@/features/ai/aiOutcomes';
import { savePendingAiRequest } from '@/features/ai/pendingAiRequest';
import { useConnectivity } from '@/features/connectivity/ConnectivityProvider';
import { OFFLINE_REQUIRED_MESSAGE } from '@/features/connectivity/offlineMessages';
import { useSession } from '@/features/session/SessionProvider';

const USE_CASES: { value: AiUseCase; label: string }[] = [
  { value: 'travel', label: '旅行' },
  { value: 'shopping', label: '買い物' },
  { value: 'hiking', label: '登山' },
  { value: 'school', label: '学校行事' },
  { value: 'custom', label: '自由入力' },
];
const AGE_BANDS: { value: AiAgeBand; label: string }[] = [
  { value: 'infant', label: '乳児' },
  { value: 'preschool', label: '未就学' },
  { value: 'elementary', label: '小学生' },
  { value: 'teen', label: '中高生' },
];
const SEASONS: { value: AiSeason; label: string }[] = [
  { value: 'spring', label: '春' },
  { value: 'summer', label: '夏' },
  { value: 'autumn', label: '秋' },
  { value: 'winter', label: '冬' },
];
const FEATURES: { value: AiFeature; label: string }[] = [
  { value: 'car', label: '車移動' },
  { value: 'rain', label: '雨予報' },
  { value: 'hot-spring', label: '温泉' },
  { value: 'meals-included', label: '食事付き' },
  { value: 'beginner', label: '初心者' },
];

const labelOf = <T extends string>(options: { value: T; label: string }[], value: T | null) =>
  options.find((option) => option.value === value)?.label ?? '指定なし';

const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
const toCount = (text: string) => {
  const parsed = parseInt(text, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

// AI-03: 3ステップの条件入力(①用途 ②人数・年齢帯 ③期間・季節・特徴・自由記述)と確認。戻って編集できる。
// 「生成する」で生成を始め(待たずに)結果画面へ進む。条件は「次回も使う」を選んだときだけ保存する。
export default function AiFlowScreen() {
  const router = useRouter();
  const { profile } = useSession();
  const { isOffline } = useConnectivity();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [draft, setDraft] = useState<AiDraft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const uid = profile?.uid ?? null;

  // 保存済みの生成条件があれば、入力の初期値にする(自由記述・メモは含まれない)。
  useEffect(() => {
    if (!uid) {
      return;
    }
    let cancelled = false;
    loadGenerationProfile(uid).then(
      (saved) => {
        if (!cancelled && saved) {
          setDraft((current) => applyProfile(current, saved));
        }
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!profile) {
    return <Redirect href="/" />;
  }

  const update = (patch: Partial<AiDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const goNext = () => {
    const message = validateStep(step as 1 | 2 | 3, draft);
    setError(message);
    if (message === null) {
      setStep((step + 1) as 2 | 3 | 4);
    }
  };

  const goBack = () => {
    setError(null);
    if (step === 1) {
      router.back();
      return;
    }
    setStep((step - 1) as 1 | 2 | 3);
  };

  const generate = async () => {
    setBusy(true);
    try {
      const requestId = randomUUID();
      await savePendingAiRequest(requestId);
      if (draft.saveProfile) {
        saveGenerationProfile(profile.uid, toProfile(draft)).catch((e) => console.error('saveGenerationProfile failed', e));
      }
      // 生成は最大約1分かかるため待たずに結果画面へ進む。応答は aiOutcomes、結果の状態は aiRequests の購読が担う。
      trackGeneration(requestId, generateList({ requestId, input: toGenerationInput(draft, profile.language) }));
      router.replace({ pathname: '/ai-result', params: { requestId } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[Typography.caption, styles.secondary]}>{step === 4 ? '確認' : `ステップ ${step} / 3`}</Text>
        {error ? <Banner message={error} variant="danger" /> : null}

        {step === 1 ? (
          <View style={styles.group}>
            <Text style={[Typography.heading, styles.title]}>何のためのリストですか?</Text>
            <View style={styles.wrap}>
              {USE_CASES.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  variant={draft.useCase === option.value ? 'selected' : 'default'}
                  onPress={() => update({ useCase: option.value })}
                />
              ))}
            </View>
            {draft.useCase === 'custom' ? (
              <Input
                placeholder="やりたいこと(例: 家族でお花見)"
                value={draft.customText}
                onChangeText={(customText) => update({ customText })}
                multiline
                accessibilityLabel="やりたいこと"
              />
            ) : null}
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.group}>
            <Text style={[Typography.heading, styles.title]}>人数を教えてください</Text>
            <Input
              placeholder="大人の人数"
              value={String(draft.adults)}
              onChangeText={(text) => update({ adults: toCount(text) })}
              keyboardType="number-pad"
              accessibilityLabel="大人の人数"
            />
            <Input
              placeholder="子どもの人数"
              value={String(draft.children)}
              onChangeText={(text) => update({ children: toCount(text), ageBands: toCount(text) > 0 ? draft.ageBands : [] })}
              keyboardType="number-pad"
              accessibilityLabel="子どもの人数"
            />
            {draft.children > 0 ? (
              <View style={styles.group}>
                <Text style={[Typography.label, styles.secondary]}>子どもの年齢帯(複数選べます)</Text>
                <View style={styles.wrap}>
                  {AGE_BANDS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      variant={draft.ageBands.includes(option.value) ? 'multiSelect' : 'default'}
                      onPress={() => update({ ageBands: toggle(draft.ageBands, option.value) })}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.group}>
            <Text style={[Typography.heading, styles.title]}>期間や特徴を教えてください</Text>
            <Input
              placeholder="泊数(0は日帰り)"
              value={String(draft.nights)}
              onChangeText={(text) => update({ nights: toCount(text) })}
              keyboardType="number-pad"
              accessibilityLabel="泊数"
            />
            <Text style={[Typography.label, styles.secondary]}>季節</Text>
            <View style={styles.wrap}>
              <Chip label="指定なし" variant={draft.season === null ? 'selected' : 'default'} onPress={() => update({ season: null })} />
              {SEASONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  variant={draft.season === option.value ? 'selected' : 'default'}
                  onPress={() => update({ season: option.value })}
                />
              ))}
            </View>
            <Text style={[Typography.label, styles.secondary]}>特徴(複数選べます)</Text>
            <View style={styles.wrap}>
              {FEATURES.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  variant={draft.features.includes(option.value) ? 'multiSelect' : 'default'}
                  onPress={() => update({ features: toggle(draft.features, option.value) })}
                />
              ))}
            </View>
            <Input
              placeholder="メモ(任意・500文字まで)"
              value={draft.notes}
              onChangeText={(notes) => update({ notes })}
              multiline
              accessibilityLabel="メモ(任意)"
            />
          </View>
        ) : null}

        {step === 4 ? (
          <View style={styles.group}>
            <Text style={[Typography.heading, styles.title]}>この条件で生成します</Text>
            <Text style={[Typography.body, styles.title]}>
              用途: {labelOf(USE_CASES, draft.useCase)}
              {draft.useCase === 'custom' ? `(${draft.customText.trim()})` : ''}
            </Text>
            <Text style={[Typography.body, styles.title]}>
              人数: 大人{draft.adults}人・子ども{draft.children}人
              {draft.children > 0 ? `(${draft.ageBands.map((band) => labelOf(AGE_BANDS, band)).join('・')})` : ''}
            </Text>
            <Text style={[Typography.body, styles.title]}>
              期間: {draft.nights === 0 ? '日帰り' : `${draft.nights}泊`} / 季節: {labelOf(SEASONS, draft.season)}
            </Text>
            {draft.features.length > 0 ? (
              <Text style={[Typography.body, styles.title]}>特徴: {draft.features.map((feature) => labelOf(FEATURES, feature)).join('・')}</Text>
            ) : null}
            {draft.notes.trim() !== '' ? <Text style={[Typography.body, styles.title]}>{draft.notes.trim()}</Text> : null}
            <Chip
              label="次回も使う"
              variant={draft.saveProfile ? 'multiSelect' : 'default'}
              onPress={() => update({ saveProfile: !draft.saveProfile })}
            />
            {isOffline ? <Banner message={OFFLINE_REQUIRED_MESSAGE} variant="warning" /> : null}
          </View>
        ) : null}

        {step < 4 ? (
          <Button label="つぎへ" onPress={goNext} variant="primary" />
        ) : (
          <Button label="生成する" onPress={generate} loading={busy} disabled={isOffline || busy} variant="primary" />
        )}
        <Button label="もどる" onPress={goBack} variant="text" />
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
  title: {
    color: Colors.textPrimary,
  },
  secondary: {
    color: Colors.textSecondary,
  },
  group: {
    gap: Spacing[3],
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
});
