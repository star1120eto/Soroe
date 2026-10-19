import { AI_MAX_ITEMS, aiResultItemSchema, aiResultSchema, type AiResult, type AiResultItem } from "@soroe/shared";

export type NormalizeResult = { ok: true; result: AiResult } | { ok: false; reason: string };

const duplicateKey = (name: string) => name.toLowerCase().replace(/\s+/g, "");

/**
 * モデルの出力を、保存できる形へ整える。項目ごとにスキーマで検証し(不正な項目だけ捨てる)、
 * 同名(大小・空白を無視)の重複を除き、80件に切る。残りが0件、または全体の形が不正なら失敗。
 */
export function normalizeAiResult(raw: unknown): NormalizeResult {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { items?: unknown }).items)) {
    return { ok: false, reason: "結果の形式が不正です" };
  }
  const input = raw as { items: unknown[] };

  const seen = new Set<string>();
  const items: AiResultItem[] = [];
  for (const candidate of input.items) {
    const parsed = aiResultItemSchema.safeParse(candidate);
    if (!parsed.success) {
      continue;
    }
    const key = duplicateKey(parsed.data.name);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(parsed.data);
    if (items.length === AI_MAX_ITEMS) {
      break;
    }
  }
  if (items.length === 0) {
    return { ok: false, reason: "使える項目がありません" };
  }

  const parsed = aiResultSchema.safeParse({ ...input, items });
  if (!parsed.success) {
    return { ok: false, reason: "結果の形式が不正です" };
  }
  return { ok: true, result: parsed.data };
}
