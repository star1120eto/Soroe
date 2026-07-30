import { FREE_ACTIVE_LIST_LIMIT } from "./constants";

export type Plan = "free" | "premium";

// 純粋関数: Firestoreに触れずテストできる(emailOtp/rateLimit.tsのcheckRateLimitに倣う)。
export function isUnderActiveListLimit(activeCount: number, plan: Plan): boolean {
  if (plan === "premium") {
    return true;
  }
  return activeCount < FREE_ACTIVE_LIST_LIMIT;
}
