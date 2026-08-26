import { describeListActionError } from '../listActionErrors';

describe('describeListActionError', () => {
  it('maps known error codes to fixed Japanese messages', () => {
    expect(describeListActionError({ code: 'resource-exhausted' })).toBe(
      'Freeプランで利用できるリストは3件までです'
    );
    expect(describeListActionError({ code: 'permission-denied' })).toBe('オーナーだけが実行できます');
    expect(describeListActionError({ code: 'not-found' })).toBe('リストが見つかりません');
  });

  it('surfaces the server message for failed-precondition since it is reused for two different situations', () => {
    expect(
      describeListActionError({ code: 'failed-precondition', message: '削除から30日を過ぎたリストは復元できません' })
    ).toBe('削除から30日を過ぎたリストは復元できません');
    expect(
      describeListActionError({ code: 'failed-precondition', message: '削除済みのリストはアーカイブできません' })
    ).toBe('削除済みのリストはアーカイブできません');
  });

  it('falls back to a generic failed-precondition message when none is provided', () => {
    expect(describeListActionError({ code: 'failed-precondition' })).toBe('操作の前提条件を満たしていません');
  });

  it('falls back to a generic message for unknown codes or non-error values', () => {
    expect(describeListActionError({ code: 'internal' })).toBe('操作に失敗しました。時間をおいてお試しください');
    expect(describeListActionError(null)).toBe('操作に失敗しました。時間をおいてお試しください');
    expect(describeListActionError(new Error('boom'))).toBe('操作に失敗しました。時間をおいてお試しください');
  });
});
