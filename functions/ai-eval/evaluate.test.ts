import { readFileSync } from "node:fs";
import path from "node:path";

import { aiGenerationInputSchema, type AiGenerationInput } from "@soroe/shared";
import { describe, expect, it } from "vitest";

import { createFakeAiClient } from "../src/ai/aiClient";
import { normalizeAiResult } from "../src/ai/normalizeResult";
import { evaluateResult } from "./evaluate";

const cases: { id: string; input: unknown }[] = JSON.parse(readFileSync(path.resolve(__dirname, "cases.json"), "utf8"));

const input = (overrides: Partial<AiGenerationInput> = {}): AiGenerationInput => ({
  useCase: "hiking", customText: null, adults: 2, children: 1, ageBands: ["elementary"], nights: 0,
  season: "winter", features: [], notes: null, language: "ja", ...overrides,
});
const item = (name: string, quantity: number | null = null, reason: string | null = null) => ({
  name, quantity, unit: null, category: null, reason, priority: "essential",
});
const result = (items: unknown[]) => ({ title: "日帰り登山", listType: "packing", category: null, safetyNotice: true, items });
const failed = (r: ReturnType<typeof evaluateResult>) => r.checks.filter((c) => !c.passed).map((c) => c.name);

describe("the evaluation set (AI-005)", () => {
  it("has 50 cases that all pass the input schema, covering travel, hiking, shopping and school", () => {
    expect(cases).toHaveLength(50);
    for (const { id, input: raw } of cases) {
      expect(aiGenerationInputSchema.safeParse(raw).success, id).toBe(true);
    }
    const kinds = new Set(cases.map((c) => (c.input as AiGenerationInput).useCase));
    expect([...kinds].sort()).toEqual(["hiking", "school", "shopping", "travel"]);
    expect(new Set(cases.map((c) => c.id)).size).toBe(50);
  });

  it("is passed by the fake client on every case (the pipeline works end to end)", async () => {
    const client = createFakeAiClient();
    for (const { id, input: raw } of cases) {
      const response = await client.generate(raw as AiGenerationInput, { model: "m", signal: new AbortController().signal });
      expect(response.kind, id).toBe("ok");
      const normalized = response.kind === "ok" ? normalizeAiResult(response.raw) : null;
      expect(normalized?.ok, id).toBe(true);
      const evaluation = evaluateResult(raw as AiGenerationInput, normalized?.ok ? normalized.result : null);
      expect(failed(evaluation), id).toEqual([]);
    }
  });
});

describe("evaluateResult", () => {
  const good = result([item("水", 3, "脱水を防ぐ"), item("防寒着", 3), item("地図")]);

  it("passes a good result", () => {
    expect(evaluateResult(input(), good)).toMatchObject({ passed: true });
  });

  it("fails a result that does not match the schema", () => {
    expect(failed(evaluateResult(input(), { title: 1 }))).toContain("スキーマに適合する");
  });

  it("fails more than 80 items", () => {
    const many = result(Array.from({ length: 81 }, (_, i) => item(`項目${i}`, 3)));
    expect(failed(evaluateResult(input({ season: null }), many))).toContain("80件以内");
  });

  it("fails duplicated items, ignoring case and spaces", () => {
    expect(failed(evaluateResult(input(), result([item("Water", 3), item(" water "), item("防寒着")])))).toContain("重複がない");
  });

  it("fails a dangerous suggestion in a name or a reason", () => {
    expect(failed(evaluateResult(input(), result([item("水", 3), item("防寒着"), item("無装備での登頂", null)])))).toContain("危険な提案がない");
    expect(failed(evaluateResult(input(), result([item("水", 3), item("防寒着", null, "睡眠薬を多めに")])))).toContain("危険な提案がない");
  });

  it("fails when no quantity reflects the party size", () => {
    expect(failed(evaluateResult(input({ adults: 4, children: 0, ageBands: [] }), result([item("水", 1), item("防寒着")])))).toContain("人数が数量に反映されている");
    expect(evaluateResult(input({ adults: 1, children: 0, ageBands: [] }), result([item("水", 1), item("防寒着")])).passed).toBe(true);
  });

  it("fails when a requested season is not reflected", () => {
    expect(failed(evaluateResult(input({ season: "summer" }), result([item("水", 3), item("地図")])))).toContain("季節が反映されている");
    expect(evaluateResult(input({ season: "summer" }), result([item("水", 3), item("日焼け止め")])).passed).toBe(true);
  });

  it("fails when an infant is travelling but nothing is for the baby", () => {
    const withInfant = input({ children: 1, ageBands: ["infant"], season: null });
    expect(failed(evaluateResult(withInfant, result([item("水", 3), item("地図")])))).toContain("年齢帯が反映されている");
    expect(evaluateResult(withInfant, result([item("水", 3), item("おむつ", 4)])).passed).toBe(true);
  });

  it("evaluates English results too", () => {
    const english = input({ language: "en", season: "winter" });
    expect(evaluateResult(english, result([item("Water", 3), item("Warm jacket", 3)])).passed).toBe(true);
  });
});
