import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// store層のtransactionを実Firestore Emulatorに対して検証するための共通処理。
// `firebase emulators:exec`がFIRESTORE_EMULATOR_HOSTを設定するので、Admin SDKは
// 自動的にEmulatorへ接続する。テストファイルごとにprojectIdを分け、並列実行
// されても互いのデータを消さないようにする。
export function connectEmulator(projectId: string): Firestore {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOSTが未設定です。`pnpm --filter functions run test:rules`(emulators:exec)経由で実行してください"
    );
  }
  if (getApps().length === 0) {
    initializeApp({ projectId });
  }
  return getFirestore();
}

export async function clearEmulator(projectId: string): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const response = await fetch(
    `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw new Error(`failed to clear the Firestore emulator: ${response.status}`);
  }
}
