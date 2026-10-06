import type { InviteUnavailableStatus } from "@soroe/shared";

// soroe-functional-specification.md 「招待は7日間有効」。
export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function computeInviteExpiry(createdAtMs: number): number {
  return createdAtMs + INVITE_EXPIRY_MS;
}

export type InviteRecord = {
  listId: string;
  inviterId: string;
  status: "active" | "revoked";
  expiresAtMs: number;
};

// archivedAt/deletedAtの型(Timestamp等)には依存せず「立っているか」だけを見る。
// Firestoreのドキュメント(DocumentData)をそのまま渡せるよう任意キーにしている。
export type InviteListRecord = {
  archivedAt?: unknown;
  deletedAt?: unknown;
};

// プレビューと受諾で共通の「この招待は今使えるか」の判定。使えない理由を
// 返し、使えるならnull。Firestoreに触れない純粋関数。
export function classifyInvite(
  invite: InviteRecord | undefined,
  list: InviteListRecord | undefined,
  nowMs: number
): InviteUnavailableStatus | null {
  if (invite === undefined) {
    return "not-found";
  }
  if (invite.status === "revoked") {
    return "revoked";
  }
  if (invite.expiresAtMs <= nowMs) {
    return "expired";
  }
  // リストのドキュメント自体が無い場合も、利用者から見れば削除済みと同じ。
  if (list === undefined || list.deletedAt != null) {
    return "list-deleted";
  }
  if (list.archivedAt != null) {
    return "list-archived";
  }
  return null;
}
