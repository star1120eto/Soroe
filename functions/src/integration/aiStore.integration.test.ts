import type { AiGenerationInput, AiResult } from "@soroe/shared";
import type { Firestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  aiRequestId,
  cancelGenerationTransaction,
  completeGenerationTransaction,
  getAiQuota,
  reserveGenerationTransaction,
} from "../ai/aiStore";
import { AI_ACTIVE_TTL_MS } from "../lists/constants";
import { clearEmulator, connectEmulator } from "./emulator";

// AI-001「予約→生成→確定/返却の状態機械。Free生涯1回、Premium日本時間月20回を原子的に判定する」の検証。
const PROJECT_ID = "soroe-it-ai-store";
const UID = "uid-1";
const NOW = Date.UTC(2026, 9, 15, 3, 0, 0);

let db: Firestore;

beforeAll(() => {
  db = connectEmulator(PROJECT_ID);
});

beforeEach(async () => {
  await clearEmulator(PROJECT_ID);
});

const input: AiGenerationInput = {
  useCase: "hiking", customText: null, adults: 2, children: 0, ageBands: [], nights: 0,
  season: "autumn", features: [], notes: null, language: "ja",
};
const result: AiResult = {
  title: "日帰り登山", listType: "packing", category: null, safetyNotice: true,
  items: [{ name: "水", quantity: 2, unit: "L", category: null, reason: null, priority: "essential" }],
};

const countOf = async (key: string) => (await db.doc(`aiUsage/${key}`).get()).data()?.count ?? 0;
const requestOf = async (uid: string, requestId: string) => (await db.doc(`aiRequests/${aiRequestId(uid, requestId)}`).get()).data();
const activeOf = async (uid = UID) => (await db.doc(`users/${uid}/aiState/active`).get()).data();

const reserve = (requestId: string, plan: "free" | "premium" = "free", nowMs = NOW, uid = UID) =>
  reserveGenerationTransaction(uid, requestId, input, plan, nowMs);
const succeed = (requestId: string, nowMs = NOW) => completeGenerationTransaction(UID, requestId, { kind: "succeeded", result }, nowMs);

describe("reserveGenerationTransaction", () => {
  it("reserves a generation: counts one use, records the request and marks it active", async () => {
    await expect(reserve("r1")).resolves.toEqual({ status: "reserved" });

    expect(await countOf(`${UID}_lifetime`)).toBe(1);
    expect(await requestOf(UID, "r1")).toMatchObject({ uid: UID, status: "reserved", usageKey: `${UID}_lifetime`, result: null });
    expect(await activeOf()).toMatchObject({ requestId: "r1", since: NOW });
  });

  it("gives a Free user exactly one use for life", async () => {
    await reserve("r1");
    await succeed("r1");

    const second = await reserve("r2");

    expect(second).toEqual({
      status: "limit-reached",
      quota: { plan: "free", used: 1, limit: 1, remaining: 0, resetsAt: null },
    });
    expect(await countOf(`${UID}_lifetime`)).toBe(1);
    expect(await requestOf(UID, "r2")).toBeUndefined();
  });

  it("gives Premium 20 uses per month and refuses the 21st with the next reset time", async () => {
    for (let index = 0; index < 20; index += 1) {
      await expect(reserve(`r${index}`, "premium")).resolves.toEqual({ status: "reserved" });
      await succeed(`r${index}`);
    }

    const result21 = await reserve("r20", "premium");

    expect(result21).toEqual({
      status: "limit-reached",
      quota: { plan: "premium", used: 20, limit: 20, remaining: 0, resetsAt: Date.UTC(2026, 9, 31, 15, 0, 0) },
    });
  });

  it("counts a new Japan Standard Time month separately from the previous one", async () => {
    const lastMoment = Date.UTC(2026, 9, 31, 14, 59, 59);
    const firstMoment = Date.UTC(2026, 9, 31, 15, 0, 0);

    await reserve("r1", "premium", lastMoment);
    await succeed("r1", lastMoment);
    await reserve("r2", "premium", firstMoment);

    expect(await countOf(`${UID}_202610`)).toBe(1);
    expect(await countOf(`${UID}_202611`)).toBe(1);
  });

  it("does not charge twice for a retried requestId, and returns the current state", async () => {
    await reserve("r1");

    const again = await reserve("r1");
    expect(again).toMatchObject({ status: "existing", request: { status: "reserved", result: null } });
    expect(await countOf(`${UID}_lifetime`)).toBe(1);

    await succeed("r1");
    const afterSuccess = await reserve("r1");
    expect(afterSuccess).toMatchObject({ status: "existing", request: { status: "succeeded", result } });
    expect(await countOf(`${UID}_lifetime`)).toBe(1);
  });

  it("allows only one generation at a time", async () => {
    await reserve("r1", "premium");

    await expect(reserve("r2", "premium")).resolves.toEqual({ status: "busy" });

    expect(await countOf(`${UID}_202610`)).toBe(1);
    expect(await requestOf(UID, "r2")).toBeUndefined();
  });

  it("reclaims a stale reservation: fails it, gives its use back, and accepts the new request", async () => {
    await reserve("r1");

    const later = NOW + AI_ACTIVE_TTL_MS + 1;
    await expect(reserve("r2", "free", later)).resolves.toEqual({ status: "reserved" });

    expect(await requestOf(UID, "r1")).toMatchObject({ status: "failed" });
    expect(await countOf(`${UID}_lifetime`)).toBe(1); // r1の分は戻り、r2が使った
    expect(await activeOf()).toMatchObject({ requestId: "r2" });
  });

  it("keeps requests of different users apart even with the same requestId", async () => {
    await reserve("r1", "free", NOW, "user-a");
    await expect(reserve("r1", "free", NOW, "user-b")).resolves.toEqual({ status: "reserved" });

    expect(await countOf("user-a_lifetime")).toBe(1);
    expect(await countOf("user-b_lifetime")).toBe(1);
  });
});

describe("completeGenerationTransaction", () => {
  it("keeps the use when a generation succeeds, stores the result and frees the slot", async () => {
    await reserve("r1");

    await expect(succeed("r1")).resolves.toEqual({ status: "succeeded" });

    expect(await countOf(`${UID}_lifetime`)).toBe(1);
    expect(await requestOf(UID, "r1")).toMatchObject({ status: "succeeded", result });
    expect(await activeOf()).toBeUndefined();
  });

  it.each(["failed", "refused"] as const)("gives the use back when a generation is %s", async (kind) => {
    await reserve("r1");

    await expect(
      completeGenerationTransaction(UID, "r1", { kind, message: "メッセージ" }, NOW)
    ).resolves.toEqual({ status: kind });

    expect(await countOf(`${UID}_lifetime`)).toBe(0);
    expect(await requestOf(UID, "r1")).toMatchObject({ status: kind, message: "メッセージ" });
    expect(await activeOf()).toBeUndefined();
    // 戻した後は、Freeの1回をまた使える。
    await expect(reserve("r2")).resolves.toEqual({ status: "reserved" });
  });

  it("changes nothing when the request was already cancelled", async () => {
    await reserve("r1");
    await cancelGenerationTransaction(UID, "r1");

    await expect(succeed("r1")).resolves.toEqual({ status: "cancelled" });

    expect(await requestOf(UID, "r1")).toMatchObject({ status: "cancelled", result: null });
    expect(await countOf(`${UID}_lifetime`)).toBe(0);
  });

  it("reports a missing request", async () => {
    await expect(succeed("nope")).resolves.toEqual({ status: "not-found" });
  });
});

describe("cancelGenerationTransaction", () => {
  it("cancels a reserved generation and gives the use back", async () => {
    await reserve("r1");

    await expect(cancelGenerationTransaction(UID, "r1")).resolves.toBe("cancelled");

    expect(await countOf(`${UID}_lifetime`)).toBe(0);
    expect(await requestOf(UID, "r1")).toMatchObject({ status: "cancelled" });
    expect(await activeOf()).toBeUndefined();
  });

  it("does not give a use back once the generation has finished", async () => {
    await reserve("r1");
    await succeed("r1");

    await expect(cancelGenerationTransaction(UID, "r1")).resolves.toBe("already-finished");

    expect(await countOf(`${UID}_lifetime`)).toBe(1);
    expect(await requestOf(UID, "r1")).toMatchObject({ status: "succeeded" });
  });

  it("reports a missing request", async () => {
    await expect(cancelGenerationTransaction(UID, "nope")).resolves.toBe("not-found");
  });
});

describe("getAiQuota", () => {
  it("shows the remaining uses for Free and Premium", async () => {
    await expect(getAiQuota(UID, "free", NOW)).resolves.toEqual({ plan: "free", used: 0, limit: 1, remaining: 1, resetsAt: null });

    await db.doc(`aiUsage/${UID}_202610`).set({ count: 3 });
    await expect(getAiQuota(UID, "premium", NOW)).resolves.toEqual({
      plan: "premium", used: 3, limit: 20, remaining: 17, resetsAt: Date.UTC(2026, 9, 31, 15, 0, 0),
    });
  });
});
