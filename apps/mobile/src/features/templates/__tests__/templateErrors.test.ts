import { describeTemplateError } from '../templateErrors';

describe('describeTemplateError', () => {
  it('explains the right limit for saving and for creating', () => {
    const error = { code: 'resource-exhausted' };
    expect(describeTemplateError(error, 'save')).toBe('Freeプランで保存できるマイテンプレートは1件までです');
    expect(describeTemplateError(error, 'create')).toBe('Freeプランで利用できるリストは3件までです');
  });

  it('explains a missing template and an empty list', () => {
    expect(describeTemplateError({ code: 'not-found' }, 'create')).toBe('テンプレートが見つかりません');
    expect(describeTemplateError({ code: 'invalid-argument', message: '項目がないリストはテンプレートにできません' }, 'save')).toBe(
      '項目がないリストはテンプレートにできません'
    );
  });

  it('falls back to a generic message', () => {
    expect(describeTemplateError(new Error('boom'), 'save')).toBe('操作に失敗しました。時間をおいてお試しください');
  });
});
