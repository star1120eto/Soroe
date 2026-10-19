import type { AiGenerationInput } from "@soroe/shared";
import { describe, expect, it } from "vitest";

import { createFakeAiClient, createUnconfiguredAiClient, getAiClient } from "./aiClient";
import { normalizeAiResult } from "./normalizeResult";

const input = (overrides: Partial<AiGenerationInput> = {}): AiGenerationInput => ({
  useCase: "hiking", customText: null, adults: 2, children: 1, ageBands: ["elementary"], nights: 0,
  season: "winter", features: [], notes: null, language: "ja", ...overrides,
});
const options = (signal: AbortSignal = new AbortController().signal) => ({ model: "m", signal });

describe("fake AI client", () => {
  const client = createFakeAiClient();

  it("returns a result that passes normalization, within 80 items", async () => {
    const response = await client.generate(input(), options());
    expect(response.kind).toBe("ok");
    const normalized = response.kind === "ok" ? normalizeAiResult(response.raw) : null;
    expect(normalized).toMatchObject({ ok: true });
    expect(normalized?.ok && normalized.result.items.length).toBeLessThanOrEqual(80);
  });

  it("scales per-person quantities with the party size and adds seasonal items", async () => {
    const small = await client.generate(input({ adults: 1, children: 0, ageBands: [] }), options());
    const large = await client.generate(input({ adults: 4, children: 2, ageBands: ["infant"] }), options());
    const quantityOf = (response: Awaited<ReturnType<typeof client.generate>>, name: string) =>
      response.kind === "ok" ? (response.raw as { items: { name: string; quantity: number | null }[] }).items.find((i) => i.name === name)?.quantity : undefined;
    expect(quantityOf(large, "水")).toBeGreaterThan(quantityOf(small, "水") as number);
    expect(JSON.stringify(small)).toContain("防寒着"); // 冬
  });

  it("uses English names for an English request", async () => {
    const response = await client.generate(input({ language: "en" }), options());
    expect(JSON.stringify(response)).toContain("Water");
  });

  it("refuses when the notes ask for it", async () => {
    await expect(client.generate(input({ notes: "REFUSE" }), options())).resolves.toMatchObject({ kind: "refusal" });
  });

  it("throws for FAIL, returns a malformed shape for BADFORMAT", async () => {
    await expect(client.generate(input({ notes: "FAIL" }), options())).rejects.toThrow();
    const bad = await client.generate(input({ notes: "BADFORMAT" }), options());
    expect(bad.kind === "ok" && normalizeAiResult(bad.raw)).toMatchObject({ ok: false });
  });

  it("returns more than 80 items for MANY so the server can cut them", async () => {
    const response = await client.generate(input({ notes: "MANY" }), options());
    expect(response.kind === "ok" && (response.raw as { items: unknown[] }).items.length).toBeGreaterThan(80);
  });

  it("waits until aborted for SLOW", async () => {
    const controller = new AbortController();
    const pending = client.generate(input({ notes: "SLOW" }), options(controller.signal));
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("getAiClient", () => {
  it("returns the fake client when AI_CLIENT=fake", async () => {
    const client = getAiClient({ AI_CLIENT: "fake" });
    await expect(client.generate(input(), options())).resolves.toMatchObject({ kind: "ok" });
  });

  it("returns an unconfigured client otherwise, which refuses to generate", async () => {
    await expect(getAiClient({}).generate(input(), options())).rejects.toThrow("not configured");
    await expect(createUnconfiguredAiClient().generate(input(), options())).rejects.toThrow("not configured");
  });
});
