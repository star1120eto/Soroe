import { beforeEach, describe, expect, it, vi } from "vitest";

import * as store from "./entitlementStore";
import { isAuthorized, revenueCatWebhookHandler } from "./revenueCatWebhook";

vi.mock("./entitlementStore");
vi.mock("firebase-functions/params", () => ({ defineSecret: () => ({ value: () => "secret" }) }));
vi.mock("firebase-functions/v2/https", () => ({ onRequest: (_o: unknown, h: unknown) => h }));

const body = { event: { id: "e1", type: "RENEWAL", app_user_id: "u", event_timestamp_ms: 1 } };
const req = (o: { method?: string; auth?: string; body?: unknown } = {}) => ({
  method: o.method ?? "POST",
  header: (n: string) => (n === "authorization" ? ("auth" in o ? o.auth : "secret") : undefined),
  body: "body" in o ? o.body : body,
});

describe("revenueCatWebhookHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(store.processRevenueCatEvent).mockResolvedValue({ status: "applied" });
  });

  it("rejects non-POST", async () => {
    expect((await revenueCatWebhookHandler(req({ method: "GET" }), "secret", 1)).status).toBe(405);
  });
  it("rejects missing or wrong authorization without touching the store", async () => {
    expect((await revenueCatWebhookHandler(req({ auth: undefined }), "secret", 1)).status).toBe(401);
    expect((await revenueCatWebhookHandler(req({ auth: "nope" }), "secret", 1)).status).toBe(401);
    expect((await revenueCatWebhookHandler(req(), "", 1)).status).toBe(401);
    expect(store.processRevenueCatEvent).not.toHaveBeenCalled();
  });
  it("rejects a malformed body", async () => {
    expect((await revenueCatWebhookHandler(req({ body: { event: {} } }), "secret", 1)).status).toBe(400);
  });
  it("applies a valid event", async () => {
    const r = await revenueCatWebhookHandler(req(), "secret", 5);
    expect(r).toEqual({ status: 200, body: { ok: true, result: "applied" } });
    expect(store.processRevenueCatEvent).toHaveBeenCalledWith(body.event, 5);
  });
  it("returns 200 for duplicates", async () => {
    vi.mocked(store.processRevenueCatEvent).mockResolvedValue({ status: "duplicate" });
    expect((await revenueCatWebhookHandler(req(), "secret", 1)).body.result).toBe("duplicate");
  });
  it("propagates store failures so RevenueCat retries", async () => {
    vi.mocked(store.processRevenueCatEvent).mockRejectedValue(new Error("boom"));
    await expect(revenueCatWebhookHandler(req(), "secret", 1)).rejects.toThrow("boom");
  });
});

describe("isAuthorized", () => {
  it("compares in constant time across lengths", () => {
    expect(isAuthorized("a", "abc")).toBe(false);
    expect(isAuthorized("abc", "abc")).toBe(true);
  });
});
