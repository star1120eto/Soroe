import type { PurchaseOutcome, RestoreOutcome } from './entitlementModel';

// PAY-003: Premium画面の表示ロジック(純粋関数)。価格・割引は仕様(PAY-01)の定価から計算し、
// 誇張や偽の割引は出さない(DesignSystem.pdf 04 Paywall)。ストアの表示価格は別にpriceStringを使う。

export const MONTHLY_PRICE_JPY = 480;
export const YEARLY_PRICE_JPY = 4800;

/** 年額の月換算(円)。 */
export const yearlyMonthlyEquivalentJpy = Math.round(YEARLY_PRICE_JPY / 12);

/** 月額12か月分に対する年額の割引率(%)。 */
export const yearlyDiscountPercent = Math.round((1 - YEARLY_PRICE_JPY / (MONTHLY_PRICE_JPY * 12)) * 100);

export type PaywallTrigger = 'list-limit' | 'template-limit' | 'ai-limit' | 'settings';

const TRIGGERS: readonly PaywallTrigger[] = ['list-limit', 'template-limit', 'ai-limit', 'settings'];

export function parsePaywallTrigger(value: unknown): PaywallTrigger {
  const raw = Array.isArray(value) ? value[0] : value;
  return TRIGGERS.find((t) => t === raw) ?? 'settings';
}

export const TRIGGER_HEADLINE: Record<PaywallTrigger, string> = {
  'list-limit': '無料プランのリスト上限(3件)に達しました',
  'template-limit': '無料プランのマイテンプレート上限(1件)に達しました',
  'ai-limit': 'AI生成の回数を使い切りました',
  settings: 'Premiumでもっと使いやすく',
};

export const PREMIUM_BENEFITS = [
  'リストを無制限に作成・参加できます',
  'マイテンプレートを無制限に保存できます',
  'AI生成を毎月20回まで使えます(無料は生涯1回)',
] as const;

export type Notice = { message: string; variant: 'info' | 'warning' | 'danger' };

const FAILURE_MESSAGE = {
  network: '通信に失敗しました。接続を確認して、もう一度お試しください',
  store: 'App Storeに接続できませんでした。時間をおいてお試しください',
  unknown: '購入できませんでした。時間をおいてお試しください',
} as const;

/** 購入の結果に応じた案内。成功とキャンセルは案内を出さない。 */
export function purchaseNotice(outcome: PurchaseOutcome): Notice | null {
  switch (outcome.status) {
    case 'purchased':
    case 'cancelled':
      return null;
    case 'pending':
      return { message: '購入は承認待ちです。承認されるとPremiumが有効になります', variant: 'info' };
    case 'already-purchased':
      return { message: 'すでに購入済みです。「購入を復元」をお試しください', variant: 'info' };
    case 'failed':
      return { message: FAILURE_MESSAGE[outcome.reason], variant: 'danger' };
  }
}

export function restoreNotice(outcome: RestoreOutcome): Notice | null {
  switch (outcome.status) {
    case 'restored':
      return null;
    case 'nothing-to-restore':
      return { message: '復元できる購入が見つかりませんでした。購入時と同じApple IDでお試しください', variant: 'info' };
    case 'failed':
      return { message: FAILURE_MESSAGE[outcome.reason], variant: 'danger' };
  }
}
