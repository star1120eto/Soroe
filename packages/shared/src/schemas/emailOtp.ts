import { z } from "zod";

// soroe-implementation-backlog.md AUTH-04 / soroe-functional-specification.md AUTH-02.
export const requestEmailOtpInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  deviceId: z.string().min(1),
});
export type RequestEmailOtpInput = z.infer<typeof requestEmailOtpInputSchema>;

// 登録有無が推測できない共通応答(常に同じ形を返す)。
export const requestEmailOtpOutputSchema = z.object({
  status: z.literal("sent"),
});
export type RequestEmailOtpOutput = z.infer<typeof requestEmailOtpOutputSchema>;

export const verifyEmailOtpInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
});
export type VerifyEmailOtpInput = z.infer<typeof verifyEmailOtpInputSchema>;

export const verifyEmailOtpOutputSchema = z.object({
  customToken: z.string().min(1),
});
export type VerifyEmailOtpOutput = z.infer<typeof verifyEmailOtpOutputSchema>;
