import { z } from "zod";

// soroe-implementation-backlog.md AUTH-01 / soroe-functional-specification.md AUTH-03.
// createdAtはFirestore Timestampをミリ秒epochへ正規化した値
// (プラットフォームごとにTimestamp実装が異なるため、共有スキーマでは扱わない)。
export const userProfileSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().trim().min(1).max(30),
  language: z.enum(["ja", "en"]),
  createdAt: z.number().int().positive(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;
