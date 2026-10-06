import { HttpsError, onCall } from "firebase-functions/v2/https";
import { removeMemberRequestSchema, type OkResponse } from "@soroe/shared";

import { removeMemberTransaction } from "./memberManagement";

export async function removeMemberHandler(input: unknown, uid: string): Promise<OkResponse> {
  const { listId, memberUid } = removeMemberRequestSchema.parse(input);

  const result = await removeMemberTransaction(uid, listId, memberUid);
  switch (result) {
    case "not-found":
      throw new HttpsError("not-found", "リストが見つかりません");
    case "forbidden":
      throw new HttpsError("permission-denied", "オーナーだけがメンバーを削除できます");
    case "target-not-member":
      throw new HttpsError("not-found", "メンバーが見つかりません");
    case "owner-cannot-leave":
      throw new HttpsError(
        "failed-precondition",
        "オーナー自身は削除できません。先に所有権を移譲するかリストを削除してください"
      );
    case "ok":
      return { ok: true };
  }
}

export const removeMember = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return removeMemberHandler(request.data, request.auth.uid);
});
