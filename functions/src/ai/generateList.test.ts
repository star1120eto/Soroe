import type { AiGenerationInput } from "@soroe/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { consumeRateLimit } from "../emailOtp/rateLimitStore";
import * as entitlements from "../lists/entitlements";
import type { AiClient } from "./aiClient";
import { getAiModel } from "./aiConfig";
import * as aiStore from "./aiStore";
import { generateListHandler } from "./generateList";

vi.mock("../emailOtp/rateLimitStore");
vi.mock("../lists/entitlements");
vi.mock("./aiConfig");
vi.mock("./aiStore");

const INPUT: AiGenerationInput = {
  useCase: "hiking", customText: null, adults: 2, children: 0, ageBands: [], nights: 0,
  season: "autumn", features: [], notes: null, language: "ja",
};
const REQUEST = { requestId: "req-1", input: INPUT };
const item = (name: string) => ({ name, quantity: null, unit: null, category: null, reason: null, priority: "essential" });
const raw = (items: unknown[]) => ({ title: "日帰り登山", listType: "packing", category: null, safetyNotice: true, items });
const quota = { plan: "free" as const, used: 1, limit: 1, remaining: 0, resetsAt: null };

function clientReturning(...responses: (() => unknown | Promise<unknown>)[]): AiClient & { generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn();
  responses.forEach((response) => generate.mockImplementationOnce(async () => response()));
  return { generate } as never;
}

describe("generateListHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(consumeRateLimit).mockResolvedValue(true);
    vi.mocked(entitlements.getPlan).mockResolvedValue("free");
    vi.mocked(getAiModel).mockResolvedValue("model-x");
    vi.mocked(aiStore.reserveGenerationTransaction).mockResolvedValue({ status: "reserved" });
    vi.mocked(aiStore.completeGenerationTransaction).mockImplementation(async (_u, _r, outcome) => ({ status: outcome.kind }));
  });

  it("generates, confirms, and returns the normalized result", async () => {
    const client = clientReturning(() => ({ kind: "ok", raw: raw([item(" 水 "), item("地図")]) }));

    const response = await generateListHandler(REQUEST, "uid-1", { client, nowMs: 1000 });

    expect(response).toMatchObject({ status: "succeeded", result: { title: "日帰り登山" } });
    expect(response.status === "succeeded" && response.result.items.map((i) => i.name)).toEqual(["水", "地図"]);
    expect(client.generate).toHaveBeenCalledWith(INPUT, expect.objectContaining({ model: "model-x", signal: expect.anything() }));
    expect(aiStore.reserveGenerationTransaction).toHaveBeenCalledWith("uid-1", "req-1", INPUT, "free", 1000);
    expect(aiStore.completeGenerationTransaction).toHaveBeenCalledWith("uid-1", "req-1", expect.objectContaining({ kind: "succeeded" }), 1000);
  });

  it("cuts a result with more than 80 items to 80", async () => {
    const client = clientReturning(() => ({ kind: "ok", raw: raw(Array.from({ length: 120 }, (_, i) => item(`項目${i}`))) }));

    const response = await generateListHandler(REQUEST, "uid-1", { client });

    expect(response.status === "succeeded" && response.result.items).toHaveLength(80);
  });

  it("reports a limit without calling the model", async () => {
    vi.mocked(aiStore.reserveGenerationTransaction).mockResolvedValue({ status: "limit-reached", quota });
    const client = clientReturning();

    await expect(generateListHandler(REQUEST, "uid-1", { client })).resolves.toEqual({ status: "limit-reached", quota });
    expect(client.generate).not.toHaveBeenCalled();
  });

  it("reports busy without calling the model", async () => {
    vi.mocked(aiStore.reserveGenerationTransaction).mockResolvedValue({ status: "busy" });
    const client = clientReturning();

    await expect(generateListHandler(REQUEST, "uid-1", { client })).resolves.toEqual({ status: "busy" });
    expect(client.generate).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "succeeded", result: { title: "t" }, message: null, listId: null }, { status: "succeeded", result: { title: "t" } }],
    [{ status: "saved", result: { title: "t" }, message: null, listId: "l" }, { status: "succeeded", result: { title: "t" } }],
    [{ status: "reserved", result: null, message: null, listId: null }, { status: "in-progress" }],
    [{ status: "failed", result: null, message: "失敗", listId: null }, { status: "failed", message: "失敗" }],
    [{ status: "refused", result: null, message: "拒否", listId: null }, { status: "refused", message: "拒否" }],
    [{ status: "cancelled", result: null, message: null, listId: null }, { status: "cancelled" }],
  ] as const)("answers a retried request from its stored state (%j) without calling the model", async (request, expected) => {
    vi.mocked(aiStore.reserveGenerationTransaction).mockResolvedValue({ status: "existing", request: request as never });
    const client = clientReturning();

    await expect(generateListHandler(REQUEST, "uid-1", { client })).resolves.toEqual(expected);
    expect(client.generate).not.toHaveBeenCalled();
    expect(aiStore.completeGenerationTransaction).not.toHaveBeenCalled();
  });

  it("returns a safety refusal and gives the use back (no retry)", async () => {
    const client = clientReturning(() => ({ kind: "refusal", message: "作成できません" }));

    await expect(generateListHandler(REQUEST, "uid-1", { client })).resolves.toEqual({ status: "refused", message: "作成できません" });
    expect(client.generate).toHaveBeenCalledTimes(1);
    expect(aiStore.completeGenerationTransaction).toHaveBeenCalledWith("uid-1", "req-1", { kind: "refused", message: "作成できません" }, expect.any(Number));
  });

  it("retries once after an error, and succeeds on the second attempt", async () => {
    const client = clientReturning(
      () => { throw new Error("temporary"); },
      () => ({ kind: "ok", raw: raw([item("水")]) })
    );

    await expect(generateListHandler(REQUEST, "uid-1", { client })).resolves.toMatchObject({ status: "succeeded" });
    expect(client.generate).toHaveBeenCalledTimes(2);
  });

  it("retries once after a malformed result, then fails and gives the use back", async () => {
    const client = clientReturning(
      () => ({ kind: "ok", raw: { title: 1 } }),
      () => ({ kind: "ok", raw: raw([]) })
    );

    const response = await generateListHandler(REQUEST, "uid-1", { client });

    expect(response.status).toBe("failed");
    expect(client.generate).toHaveBeenCalledTimes(2);
    expect(aiStore.completeGenerationTransaction).toHaveBeenCalledWith("uid-1", "req-1", expect.objectContaining({ kind: "failed" }), expect.any(Number));
  });

  it("fails after two errors without a third attempt", async () => {
    const client = clientReturning(
      () => { throw new Error("a"); },
      () => { throw new Error("b"); }
    );

    await expect(generateListHandler(REQUEST, "uid-1", { client })).resolves.toMatchObject({ status: "failed" });
    expect(client.generate).toHaveBeenCalledTimes(2);
  });

  it("times out a slow attempt, retries once, and then fails", async () => {
    const hang = ({ signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const generate = vi.fn((_input, options) => hang(options));

    const response = await generateListHandler(REQUEST, "uid-1", { client: { generate } as never, timeoutMs: 20 });

    expect(response.status).toBe("failed");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("reports a cancellation that happened while the model was working", async () => {
    vi.mocked(aiStore.completeGenerationTransaction).mockResolvedValue({ status: "cancelled" });
    const client = clientReturning(() => ({ kind: "ok", raw: raw([item("水")]) }));

    await expect(generateListHandler(REQUEST, "uid-1", { client })).resolves.toEqual({ status: "cancelled" });
  });

  it("rejects an invalid input before reserving anything", async () => {
    await expect(generateListHandler({ ...REQUEST, input: { ...INPUT, adults: 0 } }, "uid-1", { client: clientReturning() })).rejects.toThrow();
    expect(aiStore.reserveGenerationTransaction).not.toHaveBeenCalled();
  });

  it("rate-limits repeated requests", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue(false);

    await expect(generateListHandler(REQUEST, "uid-1", { client: clientReturning() })).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(aiStore.reserveGenerationTransaction).not.toHaveBeenCalled();
  });
});
