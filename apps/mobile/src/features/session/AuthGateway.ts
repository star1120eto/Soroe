import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import auth, { type FirebaseAuthTypes } from "@react-native-firebase/auth";
import functions from "@react-native-firebase/functions";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import type {
  RequestEmailOtpInput,
  RequestEmailOtpOutput,
  VerifyEmailOtpInput,
  VerifyEmailOtpOutput,
} from "@soroe/shared";

import { env } from "@/config/env";

// Firebase Authそのものへの唯一の窓口。呼び出し元はFirebaseAuthTypes.Userを
// 直接扱わず、SessionRepositoryが返すUserProfile(packages/shared)を使う。

// soroe-functional-specification.md AUTH-01「ユーザーキャンセルはエラー扱いに
// しない」。キャンセルはthrowせずcancelledで返し、他の失敗だけthrowする。
export type SignInResult = { status: "success" } | { status: "cancelled" };

export function subscribeToAuthState(
  callback: (user: FirebaseAuthTypes.User | null) => void
): () => void {
  return auth().onAuthStateChanged(callback);
}

export async function signOut(): Promise<void> {
  await auth().signOut();
}

/** AUTH-002. iOS専用。Apple非公開メールもそのまま受け入れ、自動アカウント統合はしない。 */
export async function signInWithApple(): Promise<SignInResult> {
  if (Platform.OS !== "ios") {
    throw new Error("Sign in with AppleはiOSでのみ利用できます");
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") {
      return { status: "cancelled" };
    }
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error("Appleからidentity tokenを取得できませんでした");
  }

  await auth().signInWithCredential(
    auth.AppleAuthProvider.credential(credential.identityToken)
  );
  return { status: "success" };
}

/** AUTH-003. 既存メール衝突はFirebase Auth側のエラーとしてthrowし、自動リンクはしない。 */
export async function signInWithGoogle(): Promise<SignInResult> {
  GoogleSignin.configure({
    webClientId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });

  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (response.type === "cancelled") {
      return { status: "cancelled" };
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error("GoogleからID tokenを取得できませんでした");
    }

    await auth().signInWithCredential(auth.GoogleAuthProvider.credential(idToken));
    return { status: "success" };
  } catch (error) {
    if ((error as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED) {
      return { status: "cancelled" };
    }
    throw error;
  }
}

/** AUTH-004のrequestEmailOtpを呼ぶ。応答は登録有無を区別しない共通形。 */
export async function requestEmailOtp(input: RequestEmailOtpInput): Promise<RequestEmailOtpOutput> {
  const callable = functions().httpsCallable<RequestEmailOtpInput, RequestEmailOtpOutput>(
    "requestEmailOtp"
  );
  const result = await callable(input);
  return result.data;
}

/** AUTH-004のverifyEmailOtpが返すCustom Tokenでサインインする。 */
export async function signInWithEmailOtp(input: VerifyEmailOtpInput): Promise<void> {
  const callable = functions().httpsCallable<VerifyEmailOtpInput, VerifyEmailOtpOutput>(
    "verifyEmailOtp"
  );
  const result = await callable(input);
  await auth().signInWithCustomToken(result.data.customToken);
}
