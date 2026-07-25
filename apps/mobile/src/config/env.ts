import { z } from "zod";

const envSchema = z.object({
  EXPO_PUBLIC_APP_ENV: z
    .enum(["development", "preview", "production"])
    .default("development"),
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: z.string().min(1).optional(),
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: z.string().min(1).optional(),
  // Web版のみ使用。Firebase console「ウェブアプリを追加」で発行される値。
  // iOS/AndroidはGoogleService-Info.plist/google-services.jsonから自動初期化されるため不要。
  EXPO_PUBLIC_FIREBASE_WEB_API_KEY: z.string().min(1).optional(),
  EXPO_PUBLIC_FIREBASE_WEB_AUTH_DOMAIN: z.string().min(1).optional(),
  EXPO_PUBLIC_FIREBASE_WEB_PROJECT_ID: z.string().min(1).optional(),
  EXPO_PUBLIC_FIREBASE_WEB_STORAGE_BUCKET: z.string().min(1).optional(),
  EXPO_PUBLIC_FIREBASE_WEB_MESSAGING_SENDER_ID: z.string().min(1).optional(),
  EXPO_PUBLIC_FIREBASE_WEB_APP_ID: z.string().min(1).optional(),
  // Google Sign-In (AUTH-003)。Firebase console「Google」プロバイダ有効化時に
  // 発行されるOAuthクライアントID。webClientIdはAndroid/iOS双方で必須。
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().min(1).optional(),
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: z.string().min(1).optional(),
  // Firebase Emulator接続先。未設定なら本番プロジェクトへ接続する。
  EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: z.string().min(1).optional(),
});

export const env = envSchema.parse({
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  EXPO_PUBLIC_FIREBASE_WEB_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_WEB_API_KEY,
  EXPO_PUBLIC_FIREBASE_WEB_AUTH_DOMAIN:
    process.env.EXPO_PUBLIC_FIREBASE_WEB_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_WEB_PROJECT_ID:
    process.env.EXPO_PUBLIC_FIREBASE_WEB_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_WEB_STORAGE_BUCKET:
    process.env.EXPO_PUBLIC_FIREBASE_WEB_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_WEB_MESSAGING_SENDER_ID:
    process.env.EXPO_PUBLIC_FIREBASE_WEB_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_WEB_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_WEB_APP_ID,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  EXPO_PUBLIC_FIREBASE_EMULATOR_HOST:
    process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
});
