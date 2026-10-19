import { describe, expect, it } from "vitest";

import {
  AI_MAX_ITEMS,
  aiGenerationInputSchema,
  aiResultSchema,
  generateListResponseSchema,
  saveAiResultRequestSchema,
} from "./ai";

const input = (overrides: Record<string, unknown> = {}) => ({
  useCase: "hiking",
  customText: null,
  adults: 2,
  children: 1,
  ageBands: ["elementary"],
  nights: 0,
  season: "autumn",
  features: ["beginner"],
  notes: null,
  language: "ja",
  ...overrides,
});

const item = (name: string) => ({ name, quantity: null, unit: null, category: null, reason: null, priority: "essential" });
const result = (count: number) => ({
  title: "日帰り登山",
  listType: "packing",
  category: null,
  safetyNotice: true,
  items: Array.from({ length: count }, (_, i) => item(`項目${i}`)),
});

describe("aiGenerationInputSchema", () => {
  it("accepts a valid input", () => {
    expect(aiGenerationInputSchema.safeParse(input()).success).toBe(true);
  });

  it.each([
    ["no travellers", { adults: 0, children: 0, ageBands: [] }],
    ["too many adults", { adults: 21 }],
    ["age bands without children", { children: 0, ageBands: ["infant"] }],
    ["children without an age band", { ageBands: [] }],
    ["duplicate age bands", { ageBands: ["infant", "infant"] }],
    ["a custom use case without text", { useCase: "custom", customText: null }],
    ["notes over 500 characters", { notes: "あ".repeat(501) }],
    ["more than 14 nights", { nights: 15 }],
    ["an unknown feature", { features: ["unknown"] }],
  ])("rejects %s", (_label, overrides) => {
    expect(aiGenerationInputSchema.safeParse(input(overrides)).success).toBe(false);
  });

  it("accepts a custom use case with text, and no children", () => {
    expect(
      aiGenerationInputSchema.safeParse(input({ useCase: "custom", customText: "花見", children: 0, ageBands: [] })).success
    ).toBe(true);
  });
});

describe("aiResultSchema", () => {
  it("accepts 1 to 80 items", () => {
    expect(aiResultSchema.safeParse(result(1)).success).toBe(true);
    expect(aiResultSchema.safeParse(result(AI_MAX_ITEMS)).success).toBe(true);
  });

  it("rejects 0 and 81 items, and a reason over 100 characters", () => {
    expect(aiResultSchema.safeParse(result(0)).success).toBe(false);
    expect(aiResultSchema.safeParse(result(AI_MAX_ITEMS + 1)).success).toBe(false);
    const long = result(1);
    long.items[0].reason = "あ".repeat(101) as never;
    expect(aiResultSchema.safeParse(long).success).toBe(false);
  });
});

describe("generateListResponseSchema", () => {
  it("accepts each status shape", () => {
    const quota = { plan: "free", used: 1, limit: 1, remaining: 0, resetsAt: null };
    for (const response of [
      { status: "succeeded", result: result(2) },
      { status: "in-progress" },
      { status: "refused", message: "安全上の理由で生成できません" },
      { status: "failed", message: "失敗しました" },
      { status: "limit-reached", quota },
      { status: "busy" },
      { status: "cancelled" },
    ]) {
      expect(generateListResponseSchema.safeParse(response).success, JSON.stringify(response)).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(generateListResponseSchema.safeParse({ status: "weird" }).success).toBe(false);
  });
});

describe("saveAiResultRequestSchema", () => {
  const base = { requestId: "r1", title: "日帰り登山", listType: "packing" };

  it("accepts up to 80 edited items", () => {
    expect(saveAiResultRequestSchema.safeParse({ ...base, items: result(80).items }).success).toBe(true);
  });

  it("rejects 0 and 81 items and an empty title", () => {
    expect(saveAiResultRequestSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(saveAiResultRequestSchema.safeParse({ ...base, items: result(81).items }).success).toBe(false);
    expect(saveAiResultRequestSchema.safeParse({ ...base, title: "", items: result(1).items }).success).toBe(false);
  });
});
