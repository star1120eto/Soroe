import { getApps, initializeApp } from "@react-native-firebase/app";
import { Platform } from "react-native";

import { env } from "@/config/env";

// iOS/AndroidはGoogleService-Info.plist/google-services.jsonから
// @react-native-firebase/appが自動初期化する。Webだけこの手動初期化が必要
// (RNFirebaseの各サブモジュールは@react-native-firebase/appのAPP_REGISTRYを見る。
// firebase/appの初期化ではない点に注意)。
export function initializeWebFirebase() {
  if (Platform.OS !== "web") {
    return;
  }
  if (getApps().length > 0) {
    return;
  }

  const {
    EXPO_PUBLIC_FIREBASE_WEB_API_KEY: apiKey,
    EXPO_PUBLIC_FIREBASE_WEB_AUTH_DOMAIN: authDomain,
    EXPO_PUBLIC_FIREBASE_WEB_PROJECT_ID: projectId,
    EXPO_PUBLIC_FIREBASE_WEB_STORAGE_BUCKET: storageBucket,
    EXPO_PUBLIC_FIREBASE_WEB_MESSAGING_SENDER_ID: messagingSenderId,
    EXPO_PUBLIC_FIREBASE_WEB_APP_ID: appId,
  } = env;

  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    console.warn(
      "[initializeWebFirebase] EXPO_PUBLIC_FIREBASE_WEB_* が未設定のため、Web版のFirebase初期化をスキップしました。"
    );
    return;
  }

  // ブラウザにsetImmediateが無く、RNFirebaseのweb実装が参照するため補う。
  if (typeof globalThis.setImmediate === "undefined") {
    globalThis.setImmediate = ((fn: (...args: unknown[]) => void, ...args: unknown[]) =>
      globalThis.setTimeout(fn, 0, ...args)) as typeof setImmediate;
  }

  initializeApp({
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    // Realtime Databaseは使わないが@react-native-firebase/appが必須項目として
    // 要求するため、project idから機械的に導出したURLを渡す。
    databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
  }).catch((error: Error) => {
    console.warn("[initializeWebFirebase] initializeApp failed:", error.message);
  });
}
