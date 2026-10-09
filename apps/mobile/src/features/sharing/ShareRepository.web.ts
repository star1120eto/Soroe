import { collection, onSnapshot, query, where } from 'firebase/firestore';

import { webFirestore } from '@/lib/firebase/webFirestore';

import type * as Native from './ShareRepository';

// ShareRepository.ts のWeb版。招待のメタデータ購読だけを完全版のFirestore SDKへ
// 差し替える(RN Firebaseのweb実装はlite SDKでonSnapshotを使えないため)。
// 型でネイティブ版と同じ形を保つ。

export type ActiveInvite = Native.ActiveInvite;

export const subscribeToActiveInvites: typeof Native.subscribeToActiveInvites = (listId, onChange, onError) => {
  // listIdで絞ったクエリに限り、オーナーだけが読める(firestore.rules invites)。
  const invitesQuery = query(
    collection(webFirestore(), 'invites'),
    where('listId', '==', listId),
    where('status', '==', 'active')
  );
  return onSnapshot(
    invitesQuery,
    (snapshot) =>
      onChange(
        snapshot.docs.map((doc) => ({
          inviteId: doc.id,
          expiresAt: doc.data().expiresAt?.toMillis?.() ?? 0,
        }))
      ),
    onError
  );
};

export * from './ShareCallables';
