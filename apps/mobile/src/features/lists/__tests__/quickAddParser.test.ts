import { parseQuickAddInput } from '../quickAddParser';

describe('parseQuickAddInput', () => {
  it('extracts quantity and unit separated by a space', () => {
    expect(parseQuickAddInput('牛乳 2本')).toEqual({ name: '牛乳', quantity: 2, unit: '本' });
  });

  it('extracts a decimal quantity', () => {
    expect(parseQuickAddInput('米 1.5kg')).toEqual({ name: '米', quantity: 1.5, unit: 'kg' });
  });

  it('allows a full-width space as the separator', () => {
    expect(parseQuickAddInput('タオル　3枚')).toEqual({ name: 'タオル', quantity: 3, unit: '枚' });
  });

  it('allows a quantity with no unit', () => {
    expect(parseQuickAddInput('卵 6')).toEqual({ name: '卵', quantity: 6, unit: null });
  });

  it('falls back to the full string when there is no quantity', () => {
    expect(parseQuickAddInput('新聞')).toEqual({ name: '新聞', quantity: null, unit: null });
  });

  it('falls back to the full string when name and number are not space-separated', () => {
    expect(parseQuickAddInput('卵6個')).toEqual({ name: '卵6個', quantity: null, unit: null });
  });

  it('falls back when the quantity would be zero or negative', () => {
    expect(parseQuickAddInput('牛乳 0本')).toEqual({ name: '牛乳 0本', quantity: null, unit: null });
  });

  it('trims surrounding whitespace', () => {
    expect(parseQuickAddInput('  牛乳 2本  ')).toEqual({ name: '牛乳', quantity: 2, unit: '本' });
  });
});
