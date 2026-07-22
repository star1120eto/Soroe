import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { OTP_LENGTH } from "./constants";

export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

// HMAC with a server-only secret (not a per-record salt) so a Firestore
// dump alone can't be brute-forced offline against the 10^6 code space.
export function hashOtpCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

export function verifyOtpCode(code: string, secret: string, expectedHash: string): boolean {
  const actualHash = hashOtpCode(code, secret);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
