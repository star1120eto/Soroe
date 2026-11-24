import { createHash, timingSafeEqual } from "node:crypto";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { revenueCatWebhookBodySchema } from "@soroe/shared";

import { processRevenueCatEvent } from "./entitlementStore";

// RevenueCatのWebhook設定「Authorization header value」と同じ値。コードには埋め込まない。
const webhookAuth = defineSecret("REVENUECAT_WEBHOOK_AUTH");

/** 長さが違っても時間が漏れないよう、ハッシュ同士を定数時間で比較する。 */
export function isAuthorized(header: string | undefined, expected: string): boolean {
  if (!header || !expected) return false;
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export type WebhookResponse = { status: number; body: { ok: boolean; result?: string } };

export async function revenueCatWebhookHandler(
  req: { method: string; header(name: string): string | undefined; body: unknown },
  expectedAuth: string,
  nowMs: number
): Promise<WebhookResponse> {
  if (req.method !== "POST") return { status: 405, body: { ok: false } };
  if (!isAuthorized(req.header("authorization"), expectedAuth)) return { status: 401, body: { ok: false } };

  const parsed = revenueCatWebhookBodySchema.safeParse(req.body);
  if (!parsed.success) return { status: 400, body: { ok: false } };

  // 例外はそのまま投げ、500でRevenueCatに再送させる(冪等なので安全)。
  const result = await processRevenueCatEvent(parsed.data.event, nowMs);
  return { status: 200, body: { ok: true, result: result.status } };
}

export const revenueCatWebhook = onRequest({ secrets: [webhookAuth] }, async (req, res) => {
  try {
    const out = await revenueCatWebhookHandler(req, webhookAuth.value(), Date.now());
    res.status(out.status).json(out.body);
  } catch (error) {
    console.error("revenueCatWebhook failed", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ ok: false });
  }
});
