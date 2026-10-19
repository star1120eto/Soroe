import { createHash } from "node:crypto";

// 招待トークンの平文は保存しない。ドキュメントID(invites/{tokenHash})として
// このハッシュを使い、トークンからの引き当てはO(1)、DB漏洩時もリンクを
// 復元できないようにする。トークンは256bitの乱数のためsalt/ストレッチは不要。
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
