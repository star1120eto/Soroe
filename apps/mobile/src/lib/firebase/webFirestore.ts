import { getApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

import { env } from '@/config/env';

// Web専用: 購読(onSnapshot)などを使える完全版のFirestore SDKを返す。
// RN Firebaseのweb実装は`firebase/firestore/lite`を包んでおり、リアルタイム購読を
// 使えない("Not supported in the lite SDK")ため、リスト・招待のRepositoryの
// Web版(*.web.ts)はこちらを使う。アプリ本体(Auth・Functions・プロフィールの単発読取)は
// initializeWebFirebase()が初期化したdefaultアプリを共有するので、サインイン状態も同じ。
// portはfirebase.jsonのemulators設定と揃えること(connectEmulators.tsと同じ)。
const FIRESTORE_EMULATOR_PORT = 8080;

let instance: Firestore | null = null;

export function webFirestore(): Firestore {
  if (!instance) {
    instance = getFirestore(getApp());
    const host = env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
    if (host) {
      connectFirestoreEmulator(instance, host, FIRESTORE_EMULATOR_PORT);
    }
  }
  return instance;
}
