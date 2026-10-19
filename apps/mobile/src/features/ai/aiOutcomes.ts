import type { GenerateListResponse } from '@soroe/shared';

// generateListは長い呼び出し(最大約1分)のため、条件入力の画面から待たずに結果画面へ遷移する。
// 呼び出しの応答(上限・生成中・失敗など、aiRequestsの文書が作られない場合を含む)をここで保持し、
// 結果画面が参照する。アプリを閉じたあとの復元はaiRequestsの購読が担う(ここはプロセス内だけ)。
export type AiOutcome = { kind: 'response'; response: GenerateListResponse } | { kind: 'error'; error: unknown };

const outcomes = new Map<string, AiOutcome>();
const listeners = new Map<string, Set<(outcome: AiOutcome) => void>>();

function settle(requestId: string, outcome: AiOutcome) {
  outcomes.set(requestId, outcome);
  listeners.get(requestId)?.forEach((listener) => listener(outcome));
}

export function trackGeneration(requestId: string, call: Promise<GenerateListResponse>): void {
  call.then(
    (response) => settle(requestId, { kind: 'response', response }),
    (error) => settle(requestId, { kind: 'error', error })
  );
}

export function getOutcome(requestId: string): AiOutcome | null {
  return outcomes.get(requestId) ?? null;
}

export function subscribeToOutcome(requestId: string, listener: (outcome: AiOutcome) => void): () => void {
  const known = outcomes.get(requestId);
  if (known) {
    listener(known);
  }
  const set = listeners.get(requestId) ?? new Set();
  set.add(listener);
  listeners.set(requestId, set);
  return () => {
    set.delete(listener);
  };
}
