import { readFileSync } from "node:fs";
import path from "node:path";

import type { AiGenerationInput } from "@soroe/shared";

import { getAiClient } from "../src/ai/aiClient";
import { DEFAULT_FREE_MODEL } from "../src/ai/aiConfig";
import { normalizeAiResult } from "../src/ai/normalizeResult";
import { evaluateResult } from "./evaluate";

// AI-005: 50ケースを生成して判定する回帰スクリプト。
//   pnpm run ai:eval                      # AI_CLIENT 未設定のときは案内を出して終了する
//   AI_CLIENT=fake pnpm run ai:eval       # 偽クライアントで、判定の仕組みが通ることを確認する
// functions/ で実行する(ルートからは pnpm run ai:eval)。実際のモデルでの評価は、実クライアント(別チケット)とAPIキーを用意してから行う(docs/ai-005-ac05.md)。

const cases: { id: string; description: string; input: AiGenerationInput }[] = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "ai-eval/cases.json"), "utf8")
);

async function main() {
  if (process.env.AI_CLIENT !== "fake") {
    console.error(
      "実際のAIクライアントが未設定です。偽クライアントで仕組みを確認するには AI_CLIENT=fake を付けて実行してください。\n" +
        "実際のモデルでの評価は、実クライアントとAPIキーを用意してから行います(docs/ai-005-ac05.md)。"
    );
    process.exit(2);
  }

  const client = getAiClient();
  let failures = 0;
  for (const { id, description, input } of cases) {
    const response = await client.generate(input, { model: DEFAULT_FREE_MODEL, signal: new AbortController().signal });
    const normalized = response.kind === "ok" ? normalizeAiResult(response.raw) : null;
    const evaluation = evaluateResult(input, normalized?.ok ? normalized.result : null);
    const failedChecks = evaluation.checks.filter((check) => !check.passed).map((check) => `${check.name}${check.detail ? `(${check.detail})` : ""}`);
    console.log(`${evaluation.passed ? "✓" : "✗"} ${id} ${description}${failedChecks.length ? `\n    ${failedChecks.join(" / ")}` : ""}`);
    failures += evaluation.passed ? 0 : 1;
  }
  console.log(`\n${cases.length - failures}/${cases.length} ケース合格`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
