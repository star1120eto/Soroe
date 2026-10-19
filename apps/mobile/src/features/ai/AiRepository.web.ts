import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { aiGenerationProfileSchema } from '@soroe/shared';

import { webFirestore } from '@/lib/firebase/webFirestore';

import { toAiRequestView } from './aiConverters';
import type * as Native from './AiRepository';

// AiRepository.ts のWeb版(完全版のFirestore SDK)。型でネイティブ版と同じ形を保つ。

export type AiRequestView = Native.AiRequestView;

const profileRef = (uid: string) => doc(webFirestore(), 'users', uid, 'generationProfiles', 'default');

export const subscribeToAiRequest: typeof Native.subscribeToAiRequest = (uid, requestId, onChange, onError) =>
  onSnapshot(
    doc(webFirestore(), 'aiRequests', `${uid}_${requestId}`),
    (snapshot) => {
      const data = snapshot.data();
      onChange(data ? toAiRequestView(data) : null);
    },
    onError
  );

export const loadGenerationProfile: typeof Native.loadGenerationProfile = async (uid) => {
  const parsed = aiGenerationProfileSchema.safeParse((await getDoc(profileRef(uid))).data());
  return parsed.success ? parsed.data : null;
};

export const saveGenerationProfile: typeof Native.saveGenerationProfile = async (uid, profile) => {
  await setDoc(profileRef(uid), profile);
};

export * from './AiCallables';
