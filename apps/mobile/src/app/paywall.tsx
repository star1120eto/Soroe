import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Colors, PlanCard, Skeleton, Spacing, Typography } from '@/design-system';
import { env } from '@/config/env';
import { useConnectivity } from '@/features/connectivity/ConnectivityProvider';
import { OFFLINE_REQUIRED_MESSAGE } from '@/features/connectivity/offlineMessages';
import { useEntitlement } from '@/features/billing/EntitlementProvider';
import type { PremiumPlanKind, PurchasablePlan } from '@/features/billing/entitlementModel';
import {
  PREMIUM_BENEFITS,
  TRIGGER_HEADLINE,
  parsePaywallTrigger,
  purchaseNotice,
  restoreNotice,
  yearlyDiscountPercent,
  yearlyMonthlyEquivalentJpy,
  type Notice,
} from '@/features/billing/paywallModel';

// PAY-01 Premium画面。購入前に、料金・更新間隔・自動更新・解約方法・規約を必ず確認できるようにする。
// モーダルで開くため、閉じる/購入成功で戻れば元の画面と入力内容はそのまま残る(元の操作へ戻る)。
// 機能の開放はサーバー(Webhook→getPlan)が決める。ここの購入成功表示はUI上の即時反映のみ。
export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ trigger?: string }>();
  const trigger = parsePaywallTrigger(params.trigger);
  const { isOffline } = useConnectivity();
  const { snapshot, gateway, setSnapshot, refresh } = useEntitlement();

  const [plans, setPlans] = useState<PurchasablePlan[] | null>(null);
  const [selected, setSelected] = useState<PremiumPlanKind>('yearly');
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    void refresh();
    gateway.getPlans().then((loaded) => {
      if (!cancelled) setPlans(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [gateway, refresh]);

  const selectedPlan = plans?.find((p) => p.kind === selected) ?? null;
  const disabled = isOffline || busy !== null;

  const purchase = async () => {
    if (!selectedPlan || disabled) return;
    setNotice(null);
    setBusy('purchase');
    try {
      const outcome = await gateway.purchase(selectedPlan.productId);
      if (outcome.status === 'purchased') {
        setSnapshot(outcome.snapshot);
        router.back();
        return;
      }
      setNotice(purchaseNotice(outcome));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (disabled) return;
    setNotice(null);
    setBusy('restore');
    try {
      const outcome = await gateway.restore();
      if (outcome.status === 'restored') {
        setSnapshot(outcome.snapshot);
        router.back();
        return;
      }
      setNotice(restoreNotice(outcome));
    } finally {
      setBusy(null);
    }
  };

  if (snapshot.isPremium) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[Typography.title, styles.primary]}>Premiumをご利用中です</Text>
          <Text style={[Typography.body, styles.secondary]}>
            {snapshot.willRenew ? '期間の終了時に自動で更新されます。' : '自動更新はオフです。期間の終了後はFreeプランに戻ります。'}
          </Text>
          <Text style={[Typography.caption, styles.secondary]}>
            解約・プラン変更はiPhoneの「設定」→「Apple ID」→「サブスクリプション」から行えます。
          </Text>
          <Button label="閉じる" onPress={() => router.back()} variant="secondary" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[Typography.title, styles.primary]}>{TRIGGER_HEADLINE[trigger]}</Text>
        <View style={styles.group}>
          {PREMIUM_BENEFITS.map((benefit) => (
            <Text key={benefit} style={[Typography.body, styles.primary]}>
              ・{benefit}
            </Text>
          ))}
        </View>

        {isOffline ? <Banner message={OFFLINE_REQUIRED_MESSAGE} variant="warning" /> : null}
        {notice ? <Banner message={notice.message} variant={notice.variant} /> : null}

        {plans === null ? (
          <Skeleton width="100%" height={72} />
        ) : plans.length === 0 ? (
          <Banner message="プランを読み込めませんでした。時間をおいてお試しください" variant="danger" />
        ) : (
          <View style={styles.group} accessibilityRole="radiogroup">
            {plans.map((plan) => (
              <PlanCard
                key={plan.kind}
                title={plan.kind === 'yearly' ? '年額プラン' : '月額プラン'}
                price={plan.kind === 'yearly' ? `${plan.priceString} / 年(月あたり約${yearlyMonthlyEquivalentJpy}円)` : `${plan.priceString} / 月`}
                badge={plan.kind === 'yearly' ? `月額より約${yearlyDiscountPercent}%お得` : undefined}
                selected={selected === plan.kind}
                onPress={() => setSelected(plan.kind)}
              />
            ))}
          </View>
        )}

        <Button label="Premiumを始める" onPress={purchase} disabled={!selectedPlan || disabled} loading={busy === 'purchase'} />
        <Button label="購入を復元" onPress={restore} variant="secondary" disabled={disabled} loading={busy === 'restore'} />
        <Button label="閉じる" onPress={() => router.back()} variant="text" />

        <Text style={[Typography.caption, styles.secondary]}>
          料金は選択したプランの期間(月額は1か月、年額は1年)ごとに、お支払い情報のApple IDへ請求されます。現在の期間が終わる24時間前までに解約しない限り、同じ期間で自動的に更新されます。
          解約はiPhoneの「設定」→「Apple ID」→「サブスクリプション」から、いつでも行えます。アプリを削除しても解約にはなりません。
        </Text>
        <View style={styles.links}>
          <LegalLink label="利用規約" url={env.EXPO_PUBLIC_TERMS_URL} />
          <LegalLink label="プライバシーポリシー" url={env.EXPO_PUBLIC_PRIVACY_URL} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LegalLink({ label, url }: { label: string; url?: string }) {
  // 公開前(URL未設定)は押せない表示にする。申請前にURLを設定する(PAY-001/REL-002)。
  return <Button label={label} variant="text" disabled={!url} onPress={() => url && void Linking.openURL(url)} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing[5], gap: Spacing[4] },
  group: { gap: Spacing[2] },
  primary: { color: Colors.textPrimary },
  secondary: { color: Colors.textSecondary },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
});
