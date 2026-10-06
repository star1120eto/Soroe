import firestore from '@react-native-firebase/firestore';

// 招待のメタデータ購読(Firestore)。Callableは ShareCallables.ts。Web版は
// ShareRepository.web.ts(完全版のFirestore SDKで購読する)。

/** オーナーが招待画面に表示する、有効な招待のメタデータ(トークンは含まない)。 */
export type ActiveInvite = {
  inviteId: string;
  expiresAt: number;
};

export function subscribeToActiveInvites(
  listId: string,
  onChange: (invites: ActiveInvite[]) => void,
  onError: (error: Error) => void
): () => void {
  // listIdで絞ったクエリに限り、オーナーだけが読める(firestore.rules invites)。
  return firestore()
    .collection('invites')
    .where('listId', '==', listId)
    .where('status', '==', 'active')
    .onSnapshot(
      (snapshot) =>
        onChange(
          snapshot.docs.map((doc) => ({
            inviteId: doc.id,
            expiresAt: doc.data().expiresAt?.toMillis?.() ?? 0,
          }))
        ),
      onError
    );
}

export * from './ShareCallables';
