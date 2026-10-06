import { HttpsError } from "firebase-functions/v2/https";

import { consumeRateLimit } from "../emailOtp/rateLimitStore";

// 仕様「OTP、招待、AI APIにレート制限を設ける」。トークンは256bitの乱数で総当たりは
// 現実的でないため、主な狙いは未認証のプレビューや受諾の連打によるFirestore読取の
// 濫用抑止。OTPと同じ固定窓カウンタを、別コレクションで使う。
export const INVITE_RATE_LIMIT_COLLECTION = "inviteRateLimits";

export type InviteRateLimitAction = "preview" | "accept" | "create";

const WINDOW_MS = 60 * 1000;

export const INVITE_RATE_LIMITS: Record<InviteRateLimitAction, { windowMs: number; max: number }> = {
  // 未認証。1つのIP(家庭のNATなど)から複数人が開く可能性を見込み余裕を持たせる。
  preview: { windowMs: WINDOW_MS, max: 30 },
  accept: { windowMs: WINDOW_MS, max: 10 },
  create: { windowMs: WINDOW_MS, max: 10 },
};

// subjectはpreviewならIP、accept/createならuid。
export async function enforceInviteRateLimit(
  action: InviteRateLimitAction,
  subject: string,
  nowMs: number
): Promise<void> {
  const { windowMs, max } = INVITE_RATE_LIMITS[action];
  const allowed = await consumeRateLimit(
    `${action}:${subject}`,
    nowMs,
    windowMs,
    max,
    INVITE_RATE_LIMIT_COLLECTION
  );
  if (!allowed) {
    throw new HttpsError("resource-exhausted", "しばらくしてからもう一度お試しください");
  }
}
