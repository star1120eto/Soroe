import firestore from '@react-native-firebase/firestore';
import { aiGenerationProfileSchema, type AiGenerationProfile } from '@soroe/shared';

import { toAiRequestView, type AiRequestView } from './aiConverters';

// AI生成のFirestoreへの窓口。生成の状態(aiRequests)は読取専用で、書込は Functions(AiCallables.ts)。
// 「次回も使う」の生成条件(generationProfiles)だけ本人が直接読み書きする。Web版は AiRepository.web.ts。

export type { AiRequestView };

const requestDocId = (uid: string, requestId: string) => `${uid}_${requestId}`;

export function subscribeToAiRequest(
  uid: string,
  requestId: string,
  onChange: (request: AiRequestView | null) => void,
  onError: (error: Error) => void
): () => void {
  return firestore()
    .collection('aiRequests')
    .doc(requestDocId(uid, requestId))
    .onSnapshot((snapshot) => {
      const data = snapshot.data();
      onChange(data ? toAiRequestView(data) : null);
    }, onError);
}

const profileRef = (uid: string) => firestore().collection('users').doc(uid).collection('generationProfiles').doc('default');

/** 保存済みの生成条件。無い・不正なものはnull。 */
export async function loadGenerationProfile(uid: string): Promise<AiGenerationProfile | null> {
  const snapshot = await profileRef(uid).get();
  const parsed = aiGenerationProfileSchema.safeParse(snapshot.data());
  return parsed.success ? parsed.data : null;
}

export async function saveGenerationProfile(uid: string, profile: AiGenerationProfile): Promise<void> {
  await profileRef(uid).set(profile);
}

export * from './AiCallables';
