import { HttpsError, onCall } from "firebase-functions/v2/https";
import { transferOwnershipRequestSchema, type OkResponse } from "@soroe/shared";

import { transferOwnershipTransaction } from "./memberManagement";

export async function transferOwnershipHandler(input: unknown, uid: string): Promise<OkResponse> {
  const { listId, newOwnerUid } = transferOwnershipRequestSchema.parse(input);

  const result = await transferOwnershipTransaction(uid, listId, newOwnerUid);
  switch (result) {
    case "not-found":
      throw new HttpsError("not-found", "リストが見つかりません");
    case "forbidden":
      throw new HttpsError("permission-denied", "オーナーだけが所有権を移譲できます");
    case "already-deleted":
      throw new HttpsError("failed-precondition", "削除済みのリストでは所有権を移譲できません");
    case "invalid-target":
      throw new HttpsError("invalid-argument", "自分自身には移譲できません");
    case "target-not-member":
      throw new HttpsError("failed-precondition", "移譲先は現在の編集者から選んでください");
    case "ok":
      return { ok: true };
  }
}

export const transferOwnership = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "サインインが必要です");
  }
  return transferOwnershipHandler(request.data, request.auth.uid);
});
