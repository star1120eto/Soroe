import { getFirestore } from "firebase-admin/firestore";

import { checkRateLimit, type RateLimitWindow } from "./rateLimit";

const COLLECTION = "otpRateLimits";

function docRef(key: string) {
  return getFirestore().collection(COLLECTION).doc(key);
}

// Reads the current window, applies the pure checkRateLimit decision, and
// persists the result. Returns whether the caller is allowed to proceed.
export async function consumeRateLimit(
  key: string,
  nowMs: number,
  windowMs: number,
  maxCount: number
): Promise<boolean> {
  const snap = await docRef(key).get();
  const current = snap.exists ? (snap.data() as RateLimitWindow) : undefined;

  const decision = checkRateLimit(current, nowMs, windowMs, maxCount);
  await docRef(key).set({
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
