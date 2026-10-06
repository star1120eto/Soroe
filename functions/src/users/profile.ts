import { getFirestore } from "firebase-admin/firestore";

// users/{uid}は本人しか読めないため、他メンバーに見せる表示名はサーバーが
// 読み取ってlists/{id}/members/{uid}へ非正規化する。未作成・空は null。
export async function getDisplayName(uid: string): Promise<string | null> {
  const snap = await getFirestore().collection("users").doc(uid).get();
  const name = snap.data()?.displayName;
  return typeof name === "string" && name.trim() !== "" ? name : null;
}
