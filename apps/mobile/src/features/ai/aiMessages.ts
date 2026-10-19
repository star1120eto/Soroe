import type { GenerateListResponse } from '@soroe/shared';

// 日本時間(UTC+9)の「M月D日」。Premiumの次回リセット日の表示に使う。
export function formatReset(resetsAtMs: number): string {
  const jst = new Date(resetsAtMs + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
}

/** 成功・生成中以外の応答を、画面に出す日本語へ。成功・生成中はnull。 */
export function describeGenerateOutcome(response: GenerateListResponse): string | null {
  switch (response.status) {
    case 'limit-reached':
      return response.quota.plan === 'premium'
        ? `今月の生成回数(${response.quota.limit}回)を使い切りました。次回のリセットは${formatReset(response.quota.resetsAt ?? 0)}です`
        : '無料の生成(1回)は使用済みです';
    case 'busy':
      return '別の生成が進行中です。終わってからもう一度お試しください';
    case 'cancelled':
      return '生成をキャンセルしました';
    case 'refused':
    case 'failed':
      return response.message;
    default:
      return null;
  }
}

export function describeAiError(error: unknown): string {
  const err = error as { code?: string } | null;
  switch (err?.code) {
    case 'resource-exhausted':
      return '操作が多すぎます。しばらくしてからもう一度お試しください';
    case 'not-found':
      return '生成結果が見つかりません';
    default:
      return '操作に失敗しました。時間をおいてお試しください';
  }
}
