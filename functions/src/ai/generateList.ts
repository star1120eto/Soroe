import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  generateListRequestSchema,
  type AiGenerationInput,
  type GenerateListResponse,
} from "@soroe/shared";

import { consumeRateLimit } from "../emailOtp/rateLimitStore";
import { getPlan } from "../lists/entitlements";
import { AI_TIMEOUT_MS } from "../lists/constants";
import { getAiClient, type AiClient } from "./aiClient";
import { getAiModel } from "./aiConfig";
import { completeGenerationTransaction, reserveGenerationTransaction, type CompleteOutcome } from "./aiStore";
import { normalizeAiResult } from "./normalizeResult";

// AI-002: 認証・レート制限・回数の予約→生成→検証→確定。モバイルからOpenAIを直接呼ばない。
const RATE_LIMIT_COLLECTION = "aiRateLimits";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const FAILURE_MESSAGE = "生成に失敗しました。時間をおいてもう一度お試しください";

type Deps = { client?: AiClient; nowMs?: number; timeoutMs?: number };

// 形式不正・一時エラーは1回だけ再試行する(最大2回)。安全拒否は再試行しない。各回は timeoutMs で打ち切る。
async function generateWithRetry(
  client: AiClient,
  input: AiGenerationInput,
  model: string,
  timeoutMs: number
): Promise<CompleteOutcome> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const timedOut = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("timeout")));
      });
      const response = await Promise.race([client.generate(input, { model, signal: controller.signal }), timedOut]);
      if (response.kind === "refusal") {
        return { kind: "refused", message: response.message };
      }
      const normalized = normalizeAiResult(response.raw);
      if (normalized.ok) {
        return { kind: "succeeded", result: normalized.result };
      }
    } catch (error) {
      console.warn("generateList attempt failed", error);
    } finally {
      clearTimeout(timer);
    }
  }
  return { kind: "failed", message: FAILURE_MESSAGE };
}

export async function generateListHandler(input: unknown, uid: string, deps: Deps = {}): Promise<GenerateListResponse> {
  const { requestId, input: generationInput } = generateListRequestSchema.parse(input);
  const nowMs = deps.nowMs ?? Date.now();

  const allowed = await consumeRateLimit(`generate:${uid}`, nowMs, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, RATE_LIMIT_COLLECTION);
  if (!allowed) {
    throw new HttpsError("resource-exhausted", "操作が多すぎます。しばらくしてからもう一度お試しください");
  }

  const plan = await getPlan(uid);
  const reservation = await reserveGenerationTransaction(uid, requestId, generationInput, plan, nowMs);
  if (reservation.status === "limit-reached") {
    return { status: "limit-reached", quota: reservation.quota };
  }
  if (reservation.status === "busy") {
    return { status: "busy" };
  }
  if (reservation.status === "existing") {
    // 再送・再開。保存済みの状態をそのまま返し、モデルは呼ばない(二重に消費しない)。
    const stored = reservation.request;
    switch (stored.status) {
      case "succeeded":
      case "saved":
        return { status: "succeeded", result: stored.result! };
      case "reserved":
        return { status: "in-progress" };
      case "refused":
        return { status: "refused", message: stored.message ?? "" };
      case "cancelled":
        return { status: "cancelled" };
      default:
        return { status: "failed", message: stored.message ?? FAILURE_MESSAGE };
    }
  }

  const client = deps.client ?? getAiClient();
  const model = await getAiModel(plan);
  const outcome = await generateWithRetry(client, generationInput, model, deps.timeoutMs ?? AI_TIMEOUT_MS);
  const completed = await completeGenerationTransaction(uid, requestId, outcome);

  // 生成中にキャンセルされていた場合、結果は捨てられている。
  if (completed.status === "cancelled") {
    return { status: "cancelled" };
  }
  if (outcome.kind === "succeeded") {
    return { status: "succeeded", result: outcome.result };
  }
  return { status: outcome.kind, message: outcome.message };
}

export const generateList = onCall({ timeoutSeconds: 90 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return generateListHandler(request.data, request.auth.uid);
});
