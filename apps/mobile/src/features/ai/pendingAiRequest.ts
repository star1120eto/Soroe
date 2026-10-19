import AsyncStorage from '@react-native-async-storage/async-storage';

// 生成中・未保存の結果のrequestIdを、アプリを閉じても残す(再開時にaiRequestsから状態を復元する)。
// session/pending-invite.ts と同じ作法。
const PENDING_AI_REQUEST_KEY = 'soroe.pendingAiRequest';

export async function savePendingAiRequest(requestId: string) {
  await AsyncStorage.setItem(PENDING_AI_REQUEST_KEY, requestId);
}

export async function readPendingAiRequest(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_AI_REQUEST_KEY);
}

export async function clearPendingAiRequest() {
  await AsyncStorage.removeItem(PENDING_AI_REQUEST_KEY);
}
