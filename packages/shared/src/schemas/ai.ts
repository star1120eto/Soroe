import { z } from "zod";

import { listTypeSchema } from "./list";
import { templateLanguageSchema } from "./template";

// soroe-functional-specification.md 8章(AI-01〜05)・9章 LIMIT-02。
// 入力と出力のスキーマ、Callable Functionsの入出力をまとめる。時刻はミリ秒epoch。

export const AI_MAX_ITEMS = 80;
const MAX_FREE_TEXT = 500;
const MAX_PEOPLE = 20;
const MAX_NIGHTS = 14;

export const aiUseCaseSchema = z.enum(["travel", "shopping", "hiking", "school", "custom"]);
export type AiUseCase = z.infer<typeof aiUseCaseSchema>;

export const aiAgeBandSchema = z.enum(["infant", "preschool", "elementary", "teen"]);
export type AiAgeBand = z.infer<typeof aiAgeBandSchema>;

export const aiFeatureSchema = z.enum(["car", "rain", "hot-spring", "meals-included", "beginner"]);
export type AiFeature = z.infer<typeof aiFeatureSchema>;

export const aiSeasonSchema = z.enum(["spring", "summer", "autumn", "winter"]);
export type AiSeason = z.infer<typeof aiSeasonSchema>;

export const aiPrioritySchema = z.enum(["essential", "nice-to-have"]);
export type AiPriority = z.infer<typeof aiPrioritySchema>;

const peopleSchema = z.number().int().min(0).max(MAX_PEOPLE);
const freeTextSchema = z.string().max(MAX_FREE_TEXT).nullable();

// ---- 入力 ----

export const aiGenerationInputSchema = z
  .object({
    useCase: aiUseCaseSchema,
    customText: freeTextSchema,
    adults: peopleSchema,
    children: peopleSchema,
    ageBands: z.array(aiAgeBandSchema),
    nights: z.number().int().min(0).max(MAX_NIGHTS), // 0は日帰り
    season: aiSeasonSchema.nullable(),
    features: z.array(aiFeatureSchema),
    notes: freeTextSchema,
    language: templateLanguageSchema,
  })
  .superRefine((value, ctx) => {
    if (value.adults + value.children < 1) {
      ctx.addIssue({ code: "custom", path: ["adults"], message: "人数は1人以上にしてください" });
    }
    if (value.children === 0 && value.ageBands.length > 0) {
      ctx.addIssue({ code: "custom", path: ["ageBands"], message: "子どもがいないときは年齢帯を指定できません" });
    }
    if (value.children > 0 && value.ageBands.length === 0) {
      ctx.addIssue({ code: "custom", path: ["ageBands"], message: "子どもの年齢帯を選んでください" });
    }
    if (new Set(value.ageBands).size !== value.ageBands.length) {
      ctx.addIssue({ code: "custom", path: ["ageBands"], message: "年齢帯が重複しています" });
    }
    if (new Set(value.features).size !== value.features.length) {
      ctx.addIssue({ code: "custom", path: ["features"], message: "特徴が重複しています" });
    }
    if (value.useCase === "custom" && (value.customText === null || value.customText.trim() === "")) {
      ctx.addIssue({ code: "custom", path: ["customText"], message: "自由入力の内容が必要です" });
    }
  });
export type AiGenerationInput = z.infer<typeof aiGenerationInputSchema>;

// 「次回も使う」で保存する生成条件(自由記述・メモ・言語は保存しない)。
export const aiGenerationProfileSchema = z.object({
  useCase: aiUseCaseSchema,
  adults: peopleSchema,
  children: peopleSchema,
  ageBands: z.array(aiAgeBandSchema),
  nights: z.number().int().min(0).max(MAX_NIGHTS),
  season: aiSeasonSchema.nullable(),
  features: z.array(aiFeatureSchema),
});
export type AiGenerationProfile = z.infer<typeof aiGenerationProfileSchema>;

// ---- 出力 ----

export const aiResultItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quantity: z.number().positive().nullable(),
  unit: z.string().trim().min(1).max(20).nullable(),
  category: z.string().trim().min(1).max(30).nullable(),
  reason: z.string().trim().min(1).max(100).nullable(),
  priority: aiPrioritySchema,
});
export type AiResultItem = z.infer<typeof aiResultItemSchema>;

export const aiResultSchema = z.object({
  title: z.string().trim().min(1).max(60),
  listType: listTypeSchema,
  category: z.string().trim().min(1).max(30).nullable(),
  // 登山・防災・医療など、専門機関の最新情報の確認を促す注意を出すか。
  safetyNotice: z.boolean(),
  items: z.array(aiResultItemSchema).min(1).max(AI_MAX_ITEMS),
});
export type AiResult = z.infer<typeof aiResultSchema>;

// ---- 状態・回数 ----

export const aiRequestStatusSchema = z.enum(["reserved", "succeeded", "failed", "refused", "cancelled", "saved"]);
export type AiRequestStatus = z.infer<typeof aiRequestStatusSchema>;

export const aiQuotaSchema = z.object({
  plan: z.enum(["free", "premium"]),
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
  // Premiumの次回リセット(日本時間の翌月1日0時)。Freeは生涯1回のためnull。
  resetsAt: z.number().int().positive().nullable(),
});
export type AiQuota = z.infer<typeof aiQuotaSchema>;
export const getAiQuotaResponseSchema = aiQuotaSchema;

// ---- Callable Functions ----

export const generateListRequestSchema = z.object({
  requestId: z.string().min(1),
  input: aiGenerationInputSchema,
});
export type GenerateListRequest = z.infer<typeof generateListRequestSchema>;

export const generateListResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("succeeded"), result: aiResultSchema }),
  z.object({ status: z.literal("in-progress") }),
  z.object({ status: z.literal("refused"), message: z.string() }),
  z.object({ status: z.literal("failed"), message: z.string() }),
  z.object({ status: z.literal("limit-reached"), quota: aiQuotaSchema }),
  z.object({ status: z.literal("busy") }),
  z.object({ status: z.literal("cancelled") }),
]);
export type GenerateListResponse = z.infer<typeof generateListResponseSchema>;

export const cancelGenerationRequestSchema = z.object({ requestId: z.string().min(1) });
export type CancelGenerationRequest = z.infer<typeof cancelGenerationRequestSchema>;

export const cancelGenerationResponseSchema = z.object({
  status: z.enum(["cancelled", "already-finished", "not-found"]),
});
export type CancelGenerationResponse = z.infer<typeof cancelGenerationResponseSchema>;

export const saveAiResultRequestSchema = z.object({
  requestId: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  listType: listTypeSchema,
  items: z.array(aiResultItemSchema).min(1).max(AI_MAX_ITEMS),
});
export type SaveAiResultRequest = z.infer<typeof saveAiResultRequestSchema>;

export const saveAiResultResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), listId: z.string().min(1) }),
  z.object({ status: z.literal("limit-reached") }),
  z.object({ status: z.literal("not-found") }),
]);
export type SaveAiResultResponse = z.infer<typeof saveAiResultResponseSchema>;

export const aiRatingSchema = z.enum(["helpful", "insufficient"]);
export type AiRating = z.infer<typeof aiRatingSchema>;

export const rateAiResultRequestSchema = z.object({ requestId: z.string().min(1), rating: aiRatingSchema });
export type RateAiResultRequest = z.infer<typeof rateAiResultRequestSchema>;

export const rateAiResultResponseSchema = z.object({ ok: z.literal(true) });
export type RateAiResultResponse = z.infer<typeof rateAiResultResponseSchema>;
