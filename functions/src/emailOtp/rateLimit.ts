export type RateLimitWindow = {
  windowStart: number; // epoch ms
  count: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  nextWindow: RateLimitWindow;
};

// Fixed-window counter: pure function so it's testable without Firestore.
// Callers persist `nextWindow` back to the store keyed by email/ip/deviceId.
export function checkRateLimit(
  current: RateLimitWindow | undefined,
  now: number,
  windowMs: number,
  maxCount: number
): RateLimitDecision {
  if (!current || now - current.windowStart >= windowMs) {
    return { allowed: true, nextWindow: { windowStart: now, count: 1 } };
  }
  if (current.count >= maxCount) {
    return { allowed: false, nextWindow: current };
  }
  return { allowed: true, nextWindow: { windowStart: current.windowStart, count: current.count + 1 } };
}
