import firestore from '@react-native-firebase/firestore';

// OFF-001: 端末がサーバーへつながっているかを、Firestoreの状態から読み取る。
// NetInfo等のネイティブ依存を足さずに済ませるため、自分のusers/{uid}を
// includeMetadataChanges付きで購読し、fromCache(キャッシュ由来の応答か)を見る。
// サーバーへつながると、同じ内容でもfromCache=falseへ変わるメタデータの更新が届く。
// Web版は完全版SDKで実装する(SyncStateRepository.web.ts)。

export type SyncState = { fromCache: boolean };

export function subscribeToSyncState(
  uid: string,
  onChange: (state: SyncState) => void,
  onError: (error: Error) => void
): () => void {
  return firestore()
    .collection('users')
    .doc(uid)
    .onSnapshot(
      { includeMetadataChanges: true },
      (snapshot) => onChange({ fromCache: snapshot.metadata.fromCache }),
      onError
    );
}

/** 手動の再試行。ネットワークを一度切って入れ直し、再接続を促す。 */
export async function reconnect(): Promise<void> {
  await firestore().disableNetwork();
  await firestore().enableNetwork();
}
