import { z } from "zod";

const envSchema = z.object({
  EXPO_PUBLIC_APP_ENV: z
    .enum(["development", "preview", "production"])
    .default("development"),
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: z.string().min(1).optional(),
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: z.string().min(1).optional(),
});

export const env = envSchema.parse({
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
});
