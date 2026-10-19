import { aiGenerationInputSchema } from '@soroe/shared';

import { applyProfile, emptyDraft, toGenerationInput, toProfile, validateStep, type AiDraft } from '../aiDraft';

const draft = (overrides: Partial<AiDraft> = {}): AiDraft => ({ ...emptyDraft(), useCase: 'hiking', ...overrides });

describe('toGenerationInput', () => {
  it('builds a valid input from a draft, trimming and nulling empty text', () => {
    const input = toGenerationInput(draft({ notes: '  初心者です  ', customText: '   ', children: 1, ageBands: ['elementary'] }), 'ja');

    expect(input).toMatchObject({ useCase: 'hiking', notes: '初心者です', customText: null, language: 'ja' });
    expect(aiGenerationInputSchema.safeParse(input).success).toBe(true);
  });

  it('drops the age bands when there are no children, and the custom text for a fixed use case', () => {
    const input = toGenerationInput(draft({ children: 0, ageBands: ['infant'], customText: '花見' }), 'en');

    expect(input.ageBands).toEqual([]);
    expect(input.customText).toBeNull();
    expect(input.language).toBe('en');
  });

  it('keeps the custom text for a custom use case', () => {
    expect(toGenerationInput(draft({ useCase: 'custom', customText: ' 花見 ' }), 'ja').customText).toBe('花見');
  });
});

describe('validateStep', () => {
  it('step 1 needs a use case, and text for a custom one (500 characters at most)', () => {
    expect(validateStep(1, draft({ useCase: null }))).toBe('用途を選んでください');
    expect(validateStep(1, draft({ useCase: 'custom', customText: '  ' }))).toBe('やりたいことを入力してください');
    expect(validateStep(1, draft({ useCase: 'custom', customText: 'あ'.repeat(501) }))).toBe('500文字以内で入力してください');
    expect(validateStep(1, draft())).toBeNull();
    expect(validateStep(1, draft({ useCase: 'custom', customText: '花見' }))).toBeNull();
  });

  it('step 2 needs at least one person within 20 each, and an age band when there are children', () => {
    expect(validateStep(2, draft({ adults: 0, children: 0 }))).toBe('人数は1人以上にしてください');
    expect(validateStep(2, draft({ adults: 21 }))).toBe('人数は0〜20人で入力してください');
    expect(validateStep(2, draft({ children: 2, ageBands: [] }))).toBe('子どもの年齢帯を選んでください');
    expect(validateStep(2, draft({ children: 2, ageBands: ['preschool'] }))).toBeNull();
    expect(validateStep(2, draft({ adults: 1, children: 0 }))).toBeNull();
  });

  it('step 3 limits the nights and the notes', () => {
    expect(validateStep(3, draft({ nights: 15 }))).toBe('泊数は0〜14で入力してください');
    expect(validateStep(3, draft({ notes: 'あ'.repeat(501) }))).toBe('500文字以内で入力してください');
    expect(validateStep(3, draft({ nights: 2, notes: '温泉に行きたい' }))).toBeNull();
  });
});

describe('profile', () => {
  it('keeps only the reusable conditions, and applies them to a fresh draft', () => {
    const profile = toProfile(draft({ useCase: 'travel', adults: 2, children: 1, ageBands: ['infant'], nights: 2, season: 'summer', features: ['car'], notes: '個人的な内容' }));

    expect(profile).toEqual({ useCase: 'travel', adults: 2, children: 1, ageBands: ['infant'], nights: 2, season: 'summer', features: ['car'] });
    const applied = applyProfile(emptyDraft(), profile);
    expect(applied).toMatchObject({ useCase: 'travel', adults: 2, children: 1, nights: 2, season: 'summer', notes: '', customText: '' });
  });
});
