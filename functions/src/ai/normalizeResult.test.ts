import { describe, expect, it } from "vitest";

import { normalizeAiResult } from "./normalizeResult";

const item = (name: string, extra: Record<string, unknown> = {}) => ({
  name, quantity: null, unit: null, category: null, reason: null, priority: "essential", ...extra,
});
const raw = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  title: "日帰り登山", listType: "packing", category: null, safetyNotice: true, items, ...extra,
});

describe("normalizeAiResult", () => {
  it("accepts a valid result and trims item names", () => {
    const result = normalizeAiResult(raw([item("  水  "), item("地図")]));
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.result.items.map((i) => i.name)).toEqual(["水", "地図"]);
  });

  it("drops duplicates ignoring case and spaces, keeping the first", () => {
    const result = normalizeAiResult(raw([item("Tent"), item(" tent "), item("T e n t"), item("Map")]));
    expect(result.ok && result.result.items.map((i) => i.name)).toEqual(["Tent", "Map"]);
  });

  it("cuts a result with more than 80 items down to 80", () => {
    const result = normalizeAiResult(raw(Array.from({ length: 120 }, (_, i) => item(`項目${i}`))));
    expect(result.ok && result.result.items).toHaveLength(80);
  });

  it("drops an individually malformed item and keeps the rest", () => {
    const result = normalizeAiResult(raw([item("水"), item("長い理由", { reason: "あ".repeat(101) }), { nope: 1 }]));
    expect(result.ok && result.result.items.map((i) => i.name)).toEqual(["水"]);
  });

  it("fails when nothing usable remains", () => {
    expect(normalizeAiResult(raw([]))).toMatchObject({ ok: false });
    expect(normalizeAiResult(raw([item("A"), item("a")]))).toMatchObject({ ok: true });
    expect(normalizeAiResult(raw([{ nope: 1 }]))).toMatchObject({ ok: false });
  });

  it("fails on a malformed top level", () => {
    expect(normalizeAiResult(null)).toMatchObject({ ok: false });
    expect(normalizeAiResult({ title: 123, items: [item("水")] })).toMatchObject({ ok: false });
    expect(normalizeAiResult(raw([item("水")], { listType: "weird" }))).toMatchObject({ ok: false });
  });
});
