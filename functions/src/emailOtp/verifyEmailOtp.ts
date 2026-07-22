import { getAuth } from "firebase-admin/auth";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { verifyEmailOtpInputSchema, type VerifyEmailOtpOutput } from "@soroe/shared";

import { OTP_MAX_ATTEMPTS } from "./constants";
import { verifyOtpCode } from "./otpCode";
import { deleteOtpRecord, getOtpRecord, incrementOtpAttempts } from "./otpStore";
import { isExpired } from "./otpTiming";
import { otpHashSecret } from "./requestEmailOtp";

async function getOrCreateAuthUserId(email: string): Promise<string> {
  try {
    const user = await getAuth().getUserByEmail(email);
    return user.uid;
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      const user = await getAuth().createUser({ email, emailVerified: true });
      return user.uid;
    }
    throw error;
  }
}

export async function verifyEmailOtpHandler(
  input: { email: string; code: string },
  hashSecret: string,
  now: number = Date.now()
): Promise<VerifyEmailOtpOutput> {
  const { email, code } = verifyEmailOtpInputSchema.parse(input);

  const record = await getOtpRecord(email);
  if (!record) {
    throw new HttpsError("invalid-argument", "コードが正しくありません");
  }

  if (isExpired(record.expiresAtMs, now)) {
    await deleteOtpRecord(email);
    throw new HttpsError("deadline-exceeded", "コードの有効期限が切れています");
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtpRecord(email);
    throw new HttpsError("resource-exhausted", "試行回数の上限に達しました。再度コードをリクエストしてください");
  }

  if (!verifyOtpCode(code, hashSecret, record.codeHash)) {
    await incrementOtpAttempts(email);
    throw new HttpsError("invalid-argument", "コードが正しくありません");
  }

  // 成功後はコードを即時無効化する。
  await deleteOtpRecord(email);

  const uid = await getOrCreateAuthUserId(email);
  const customToken = await getAuth().createCustomToken(uid);

  return { customToken };
}

export const verifyEmailOtp = onCall({ secrets: [otpHashSecret] }, async (request) => {
  return verifyEmailOtpHandler(request.data, otpHashSecret.value());
});
