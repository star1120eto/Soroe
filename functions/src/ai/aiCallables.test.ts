import { beforeEach, describe, expect, it, vi } from "vitest";

import * as entitlements from "../lists/entitlements";
import * as profile from "../users/profile";
import { cancelGenerationHandler } from "./cancelGeneration";
import { getAiQuotaHandler } from "./getAiQuota";
import * as aiStore from "./aiStore";
import { rateAiResultHandler } from "./rateAiResult";
import { saveAiResultHandler } from "./saveAiResult";

vi.mock("../lists/entitlements");
vi.mock("../users/profile");
vi.mock("./aiStore");

const item = { name: "水", quantity: null, unit: null, category: null, reason: null, priority: "essential" };
const SAVE = { requestId: "req-1", title: "日帰り登山", listType: "packing", items: [item] };

describe("AI callables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entitlements.getPlan).mockResolvedValue("free");
    vi.mocked(profile.getDisplayName).mockResolvedValue("たろう");
  });

  it("cancelGeneration returns the store's answer", async () => {
    vi.mocked(aiStore.cancelGenerationTransaction).mockResolvedValue("cancelled");
    await expect(cancelGenerationHandler({ requestId: "req-1" }, "uid-1")).resolves.toEqual({ status: "cancelled" });
    expect(aiStore.cancelGenerationTransaction).toHaveBeenCalledWith("uid-1", "req-1");
  });

  it("getAiQuota returns the plan's remaining uses", async () => {
    const quota = { plan: "free" as const, used: 0, limit: 1, remaining: 1, resetsAt: null };
    vi.mocked(aiStore.getAiQuota).mockResolvedValue(quota);
    await expect(getAiQuotaHandler("uid-1", 5)).resolves.toEqual(quota);
    expect(aiStore.getAiQuota).toHaveBeenCalledWith("uid-1", "free", 5);
  });

  it("rateAiResult records the rating, or says not-found", async () => {
    vi.mocked(aiStore.rateAiResultTransaction).mockResolvedValue("ok");
    await expect(rateAiResultHandler({ requestId: "req-1", rating: "helpful" }, "uid-1")).resolves.toEqual({ ok: true });

    vi.mocked(aiStore.rateAiResultTransaction).mockResolvedValue("not-found");
    await expect(rateAiResultHandler({ requestId: "req-1", rating: "helpful" }, "uid-1")).rejects.toMatchObject({ code: "not-found" });
    await expect(rateAiResultHandler({ requestId: "req-1", rating: "great" }, "uid-1")).rejects.toThrow();
  });

  it.each([
    [{ status: "saved", listId: "l-1" }, { status: "saved", listId: "l-1" }],
    [{ status: "reused", listId: "l-1" }, { status: "saved", listId: "l-1" }],
    [{ status: "limit-reached" }, { status: "limit-reached" }],
    [{ status: "not-found" }, { status: "not-found" }],
  ] as const)("saveAiResult maps %j to %j", async (result, expected) => {
    vi.mocked(aiStore.saveAiResultTransaction).mockResolvedValue(result as never);
    await expect(saveAiResultHandler(SAVE, "uid-1")).resolves.toEqual(expected);
  });

  it("saveAiResult rejects 0 items, 81 items and an empty title before touching the store", async () => {
    await expect(saveAiResultHandler({ ...SAVE, items: [] }, "uid-1")).rejects.toThrow();
    await expect(saveAiResultHandler({ ...SAVE, items: Array.from({ length: 81 }, () => item) }, "uid-1")).rejects.toThrow();
    await expect(saveAiResultHandler({ ...SAVE, title: "" }, "uid-1")).rejects.toThrow();
    expect(aiStore.saveAiResultTransaction).not.toHaveBeenCalled();
  });
});
