import { getFirestore } from "firebase-admin/firestore";
import { userProfileSchema } from "@soroe/shared";

// users/{uid}は本人しか読めないため、他メンバーに見せる表示名はサーバーが
// 読み取ってlists/{id}/members/{uid}へ非正規化する。
// users/{uid}はクライアントが検証なしで書き込めるため、他メンバーの端末へ配る前に
// プロフィールと同じ規則(trim、1〜30文字)で検証する。満たさない・未作成は null。
export async function getDisplayName(uid: string): Promise<string | null> {
  const snap = await getFirestore().collection("users").doc(uid).get();
  const parsed = userProfileSchema.shape.displayName.safeParse(snap.data()?.displayName);
  return parsed.success ? parsed.data : null;
}
