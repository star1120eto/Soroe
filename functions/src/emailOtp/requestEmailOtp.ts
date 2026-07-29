import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import {
  requestEmailOtpInputSchema,
  type RequestEmailOtpOutput,
} from "@soroe/shared";

import {
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  RATE_LIMIT_MAX_PER_DEVICE,
  RATE_LIMIT_MAX_PER_EMAIL,
  RATE_LIMIT_MAX_PER_IP,
  RATE_LIMIT_WINDOW_MINUTES,
} from "./constants";
import { ConsoleEmailProvider, type EmailProvider } from "./emailProvider";
import { generateOtpCode, hashOtpCode } from "./otpCode";
import { getOtpRecord, saveOtpRecord } from "./otpStore";
import { isWithinCooldown } from "./otpTiming";
import { consumeRateLimit, rateLimitKey } from "./rateLimitStore";

export const otpHashSecret = defineSecret("OTP_HASH_SECRET");

const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

export async function requestEmailOtpHandler(
  input: { email: string; deviceId: string },
  ip: string,
  emailProvider: EmailProvider,
  hashSecret: string,
  now: number = Date.now()
): Promise<RequestEmailOtpOutput> {
  const { email, deviceId } = requestEmailOtpInputSchema.parse(input);

  const [emailAllowed, ipAllowed, deviceAllowed] = await Promise.all([
    consumeRateLimit(rateLimitKey("email", email), now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_PER_EMAIL),
    consumeRateLimit(rateLimitKey("ip", ip), now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_PER_IP),
    consumeRateLimit(
      rateLimitKey("device", deviceId),
      now,
      RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_MAX_PER_DEVICE
    ),
  ]);

  if (!emailAllowed || !ipAllowed || !deviceAllowed) {
    throw new HttpsError("resource-exhausted", "しばらくしてからもう一度お試しください");
  }

  const existing = await getOtpRecord(email);
  if (existing && isWithinCooldown(existing.createdAtMs, now, OTP_RESEND_COOLDOWN_SECONDS)) {
    throw new HttpsError("resource-exhausted", "再送は60秒後にお試しください");
  }

  const code = generateOtpCode();
  await saveOtpRecord(email, {
    codeHash: hashOtpCode(code, hashSecret),
    createdAtMs: now,
    expiresAtMs: now + OTP_EXPIRY_MINUTES * 60 * 1000,
  });

  await emailProvider.sendOtpEmail(email, code);

  // 登録有無が推測できない共通応答(常に同じ形)。
  return { status: "sent" };
}

// invoker: "public" はCloud Run側のIAMを開けるだけで、認証を無くす意味ではない。
// サインイン前にも呼べる必要がある関数であり、悪用はレート制限(メール/IP/端末)と
// 登録有無を区別しない共通応答で抑える。
export const requestEmailOtp = onCall({ secrets: [otpHashSecret], invoker: "public" }, async (request) => {
  return requestEmailOtpHandler(
    request.data,
    request.rawRequest.ip ?? "unknown",
    new ConsoleEmailProvider(),
    otpHashSecret.value()
  );
});
