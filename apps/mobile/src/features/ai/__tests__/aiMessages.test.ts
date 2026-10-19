import { describeAiError, describeGenerateOutcome, formatReset } from '../aiMessages';

describe('formatReset', () => {
  it('shows the Japan Standard Time date', () => {
    expect(formatReset(Date.UTC(2026, 9, 31, 15, 0, 0))).toBe('11月1日');
    expect(formatReset(Date.UTC(2026, 11, 31, 15, 0, 0))).toBe('1月1日');
  });
});

describe('describeGenerateOutcome', () => {
  const freeQuota = { plan: 'free' as const, used: 1, limit: 1, remaining: 0, resetsAt: null };
  const premiumQuota = { plan: 'premium' as const, used: 20, limit: 20, remaining: 0, resetsAt: Date.UTC(2026, 9, 31, 15, 0, 0) };

  it('explains each limit', () => {
    expect(describeGenerateOutcome({ status: 'limit-reached', quota: freeQuota })).toBe('無料の生成(1回)は使用済みです');
    expect(describeGenerateOutcome({ status: 'limit-reached', quota: premiumQuota })).toBe('今月の生成回数(20回)を使い切りました。次回のリセットは11月1日です');
  });

  it('explains busy, cancelled, refused and failed', () => {
    expect(describeGenerateOutcome({ status: 'busy' })).toBe('別の生成が進行中です。終わってからもう一度お試しください');
    expect(describeGenerateOutcome({ status: 'cancelled' })).toBe('生成をキャンセルしました');
    expect(describeGenerateOutcome({ status: 'refused', message: '作成できません' })).toBe('作成できません');
    expect(describeGenerateOutcome({ status: 'failed', message: '失敗しました' })).toBe('失敗しました');
  });

  it('has nothing to say for a success or a generation in progress', () => {
    expect(describeGenerateOutcome({ status: 'in-progress' })).toBeNull();
  });
});

describe('describeAiError', () => {
  it('maps the known codes and falls back to a generic message', () => {
    expect(describeAiError({ code: 'resource-exhausted' })).toBe('操作が多すぎます。しばらくしてからもう一度お試しください');
    expect(describeAiError({ code: 'not-found' })).toBe('生成結果が見つかりません');
    expect(describeAiError(new Error('boom'))).toBe('操作に失敗しました。時間をおいてお試しください');
  });
});
