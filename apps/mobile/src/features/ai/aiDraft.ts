import type {
  AiAgeBand,
  AiFeature,
  AiGenerationInput,
  AiGenerationProfile,
  AiSeason,
  AiUseCase,
  TemplateLanguage,
} from '@soroe/shared';

// AI-03: 条件入力の下書きと、ステップごとの検証・正規化(送信前の確認・正規化)。
export type AiDraft = {
  useCase: AiUseCase | null;
  customText: string;
  adults: number;
  children: number;
  ageBands: AiAgeBand[];
  nights: number; // 0は日帰り
  season: AiSeason | null;
  features: AiFeature[];
  notes: string;
  saveProfile: boolean; // 「次回も使う」
};

const MAX_TEXT = 500;
const MAX_PEOPLE = 20;
const MAX_NIGHTS = 14;

export function emptyDraft(): AiDraft {
  return {
    useCase: null,
    customText: '',
    adults: 2,
    children: 0,
    ageBands: [],
    nights: 0,
    season: null,
    features: [],
    notes: '',
    saveProfile: false,
  };
}

const orNull = (text: string) => (text.trim() === '' ? null : text.trim());

export function toGenerationInput(draft: AiDraft, language: TemplateLanguage): AiGenerationInput {
  return {
    useCase: draft.useCase ?? 'custom',
    customText: draft.useCase === 'custom' ? orNull(draft.customText) : null,
    adults: draft.adults,
    children: draft.children,
    ageBands: draft.children > 0 ? draft.ageBands : [],
    nights: draft.nights,
    season: draft.season,
    features: draft.features,
    notes: orNull(draft.notes),
    language,
  };
}

/** そのステップの入力が正しければnull、そうでなければ画面に出すメッセージ。 */
export function validateStep(step: 1 | 2 | 3, draft: AiDraft): string | null {
  if (step === 1) {
    if (draft.useCase === null) {
      return '用途を選んでください';
    }
    if (draft.useCase === 'custom') {
      if (draft.customText.trim() === '') {
        return 'やりたいことを入力してください';
      }
      if (draft.customText.length > MAX_TEXT) {
        return '500文字以内で入力してください';
      }
    }
    return null;
  }
  if (step === 2) {
    if (draft.adults < 0 || draft.adults > MAX_PEOPLE || draft.children < 0 || draft.children > MAX_PEOPLE) {
      return '人数は0〜20人で入力してください';
    }
    if (draft.adults + draft.children < 1) {
      return '人数は1人以上にしてください';
    }
    if (draft.children > 0 && draft.ageBands.length === 0) {
      return '子どもの年齢帯を選んでください';
    }
    return null;
  }
  if (draft.nights < 0 || draft.nights > MAX_NIGHTS) {
    return '泊数は0〜14で入力してください';
  }
  if (draft.notes.length > MAX_TEXT) {
    return '500文字以内で入力してください';
  }
  return null;
}

// 「次回も使う」で保存するのは、繰り返し使う条件だけ(自由記述・メモは保存しない)。
export function toProfile(draft: AiDraft): AiGenerationProfile {
  return {
    useCase: draft.useCase ?? 'custom',
    adults: draft.adults,
    children: draft.children,
    ageBands: draft.children > 0 ? draft.ageBands : [],
    nights: draft.nights,
    season: draft.season,
    features: draft.features,
  };
}

export function applyProfile(draft: AiDraft, profile: AiGenerationProfile): AiDraft {
  return { ...draft, ...profile };
}
