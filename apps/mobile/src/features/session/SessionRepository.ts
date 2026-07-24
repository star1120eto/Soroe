import firestore, { type FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
import { userProfileSchema, type UserProfile } from "@soroe/shared";

const USERS_COLLECTION = "users";

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await firestore().collection(USERS_COLLECTION).doc(uid).get();
  // snap.existsはRNFirebaseのnative実装ではboolean、web実装では関数として
  // 返ってくることがあり真偽判定が信用できないため、data()の有無で判定する。
  const data = snap.data() as
    | {
        displayName: string;
        language: "ja" | "en";
        createdAt: FirebaseFirestoreTypes.Timestamp;
      }
    | undefined;
  if (!data) {
    return null;
  }
  return userProfileSchema.parse({
    uid,
    displayName: data.displayName,
    language: data.language,
    createdAt: data.createdAt.toMillis(),
  });
}

export async function createUserProfile(
  uid: string,
  input: { displayName: string; language: "ja" | "en" }
): Promise<UserProfile> {
  const createdAtMs = Date.now();
  await firestore()
    .collection(USERS_COLLECTION)
    .doc(uid)
    .set({
      displayName: input.displayName,
      language: input.language,
      createdAt: firestore.Timestamp.fromMillis(createdAtMs),
    });

  return userProfileSchema.parse({ uid, ...input, createdAt: createdAtMs });
}
