import { initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";

// getFirestore()/getAuth()を使う前に必須。関数モジュールのimportより先に
// 評価されるよう、ここ(エントリポイントの最上部)で初期化する。
initializeApp();

export function pingHandler() {
  return { ok: true };
}

export const ping = onCall(() => pingHandler());

export { requestEmailOtp } from "./emailOtp/requestEmailOtp";
export { verifyEmailOtp } from "./emailOtp/verifyEmailOtp";
export { createList } from "./lists/createList";
export { syncListRef } from "./lists/syncListRef";
