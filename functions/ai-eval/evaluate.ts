import { AI_MAX_ITEMS, aiResultSchema, type AiGenerationInput, type AiSeason } from "@soroe/shared";

// AI-005: 生成結果の回帰判定。プロンプトやモデルを変えたとき、品質が落ちていないかを機械的に確認する。
// 判定は、スキーマ適合・80件以内・重複・危険な提案・人数/季節/年齢帯の反映。完全な品質の保証ではなく、
// 明らかな崩れを検出するための最低限の関門(危険語・季節語のリストは、評価の結果を見て育てる)。

export type Check = { name: string; passed: boolean; detail?: string };
export type Evaluation = { checks: Check[]; passed: boolean };

// 登山・防災などで、提案してはいけない内容。項目名と理由に含まれていたら不合格にする。
export const DANGEROUS_TERMS = [
  "単独行", "無装備", "自己判断で服用", "服用量", "睡眠薬", "花火", "刃渡り",
  "solo climb", "no gear", "dosage", "sleeping pill", "fireworks",
];

// 季節の指定が反映されているとみなす語(項目名または理由に含まれる)。
export const SEASON_TERMS: Record<AiSeason, string[]> = {
  winter: ["防寒", "ダウン", "手袋", "カイロ", "ニット", "warm", "jacket", "gloves", "hand warmer"],
  summer: ["日焼け", "虫よけ", "熱中症", "帽子", "冷却", "sunscreen", "bug", "hat", "cooling"],
  spring: ["羽織", "上着", "薄手", "花粉", "light jacket", "layer", "pollen"],
  autumn: ["羽織", "上着", "薄手", "light jacket", "layer"],
};

const BABY_TERMS = ["おむつ", "ミルク", "離乳食", "ベビー", "抱っこ", "diaper", "formula", "baby"];

const duplicateKey = (name: string) => name.toLowerCase().replace(/\s+/g, "");

type LooseItem = { name?: unknown; quantity?: unknown; reason?: unknown };

function itemsOf(result: unknown): LooseItem[] {
  const items = (result as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as LooseItem[]) : [];
}

const textOf = (item: LooseItem) => `${typeof item.name === "string" ? item.name : ""} ${typeof item.reason === "string" ? item.reason : ""}`.toLowerCase();

export function evaluateResult(input: AiGenerationInput, result: unknown): Evaluation {
  const items = itemsOf(result);
  const names = items.map((item) => (typeof item.name === "string" ? item.name : ""));
  const people = input.adults + input.children;
  const texts = items.map(textOf);
  const mentions = (terms: string[]) => texts.some((text) => terms.some((term) => text.includes(term.toLowerCase())));

  const duplicates = names.filter((name, index) => names.findIndex((other) => duplicateKey(other) === duplicateKey(name)) !== index);
  const dangerous = texts.filter((text) => DANGEROUS_TERMS.some((term) => text.includes(term.toLowerCase())));

  const checks: Check[] = [
    { name: "スキーマに適合する", passed: aiResultSchema.safeParse(result).success },
    { name: "80件以内", passed: items.length <= AI_MAX_ITEMS, detail: `${items.length}件` },
    { name: "重複がない", passed: duplicates.length === 0, detail: duplicates.join("、") || undefined },
    { name: "危険な提案がない", passed: dangerous.length === 0, detail: dangerous.join(" / ") || undefined },
    {
      name: "人数が数量に反映されている",
      // 1人なら人数倍の差が出ないため対象外。2人以上なら、人数以上の数量を持つ項目が1つはあるはず。
      passed: people <= 1 || items.some((item) => typeof item.quantity === "number" && item.quantity >= people),
      detail: `${people}人`,
    },
    {
      name: "季節が反映されている",
      passed: input.season === null || mentions(SEASON_TERMS[input.season]),
      detail: input.season ?? undefined,
    },
    {
      name: "年齢帯が反映されている",
      passed: !input.ageBands.includes("infant") || mentions(BABY_TERMS),
      detail: input.ageBands.join("、") || undefined,
    },
  ];
  return { checks, passed: checks.every((check) => check.passed) };
}
