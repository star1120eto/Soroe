import auth, { type FirebaseAuthTypes } from "@react-native-firebase/auth";

// Firebase Authそのものへの唯一の窓口。AUTH-002〜004(Apple/Google/メールOTP)は
// ここへ新しいsignInWith*関数を追加していく想定。呼び出し元はFirebaseAuthTypes.User
// を直接扱わず、SessionRepositoryが返すUserProfile(packages/shared)を使う。
export function subscribeToAuthState(
  callback: (user: FirebaseAuthTypes.User | null) => void
): () => void {
  return auth().onAuthStateChanged(callback);
}

// AUTH-002〜004実装までの暫定サインイン手段。Firebase console側で匿名ログインを
// 有効化済み(ENV-002)。実方式が揃い次第、呼び出し側をそちらへ切り替える。
export async function signInAnonymously(): Promise<void> {
  await auth().signInAnonymously();
}

export async function signOut(): Promise<void> {
  await auth().signOut();
}
