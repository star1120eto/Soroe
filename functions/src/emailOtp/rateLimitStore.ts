import { getFirestore } from "firebase-admin/firestore";

import { checkRateLimit, type RateLimitWindow } from "./rateLimit";

const DEFAULT_COLLECTION = "otpRateLimits";

function docRef(key: string, collection: string) {
  return getFirestore().collection(collection).doc(key);
}

// Reads the current window, applies the pure checkRateLimit decision, and
// persists the result. Returns whether the caller is allowed to proceed.
export async function consumeRateLimit(
  key: string,
  nowMs: number,
  windowMs: number,
  maxCount: number,
  collection: string = DEFAULT_COLLECTION
): Promise<boolean> {
  const snap = await docRef(key, collection).get();
  const current = snap.exists ? (snap.data() as RateLimitWindow) : undefined;

  const decision = checkRateLimit(current, nowMs, windowMs, maxCount);
  await docRef(key, collection).set({
    windowStart: decision.nextWindow.windowStart,
    count: decision.nextWindow.count,
  });

  return decision.allowed;
}

export function rateLimitKey(kind: "email" | "ip" | "device", value: string): string {
  return `${kind}:${value}`;
}

// Re-exported so callers only need one import for Timestamp-free window math.
export type { RateLimitWindow };
