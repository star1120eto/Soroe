import { disableNetwork, doc, enableNetwork, onSnapshot } from 'firebase/firestore';

import { webFirestore } from '@/lib/firebase/webFirestore';

import type * as Native from './SyncStateRepository';

// SyncStateRepository.ts のWeb版(完全版のFirestore SDK)。型でネイティブ版と同じ形を保つ。

export type SyncState = Native.SyncState;

export const subscribeToSyncState: typeof Native.subscribeToSyncState = (uid, onChange, onError) =>
  onSnapshot(
    doc(webFirestore(), 'users', uid),
    { includeMetadataChanges: true },
    (snapshot) => onChange({ fromCache: snapshot.metadata.fromCache }),
    onError
  );

export const reconnect: typeof Native.reconnect = async () => {
  await disableNetwork(webFirestore());
  await enableNetwork(webFirestore());
};
