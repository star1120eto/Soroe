import { toAiRequestView } from '../aiConverters';

const result = { title: '日帰り登山', listType: 'packing', category: null, safetyNotice: true, items: [{ name: '水', quantity: null, unit: null, category: null, reason: null, priority: 'essential' }] };

describe('toAiRequestView', () => {
  it('converts a succeeded request with its result', () => {
    expect(toAiRequestView({ status: 'succeeded', result, message: null, listId: null, rating: 'helpful' })).toMatchObject({
      status: 'succeeded',
      result: { title: '日帰り登山' },
      rating: 'helpful',
    });
  });

  it('turns a result that does not match the schema into null instead of throwing', () => {
    expect(toAiRequestView({ status: 'succeeded', result: { title: 1 } }).result).toBeNull();
  });

  it('keeps messages and the saved list id, and defaults the missing parts', () => {
    expect(toAiRequestView({ status: 'refused', message: '拒否' })).toEqual({ status: 'refused', result: null, message: '拒否', listId: null, rating: null });
    expect(toAiRequestView({ status: 'saved', listId: 'l-1', result })).toMatchObject({ status: 'saved', listId: 'l-1' });
  });
});
