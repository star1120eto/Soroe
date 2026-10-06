const DAY_MS = 24 * 60 * 60 * 1000;

// expiresAtは招待のFirestoreドキュメントから読んだミリ秒epoch。
export function isInviteActive(invite: { expiresAt: number }, nowMs: number): boolean {
  return invite.expiresAt > nowMs;
}

/** 「あと7日(10/14まで)」。残りは切り上げ、最終日も「あと1日」と読めるようにする。 */
export function formatInviteExpiry(expiresAtMs: number, nowMs: number): string {
  const remainingMs = expiresAtMs - nowMs;
  if (remainingMs <= 0) {
    return '期限切れ';
  }
  const days = Math.ceil(remainingMs / DAY_MS);
  const date = new Date(expiresAtMs);
  return `あと${days}日(${date.getMonth() + 1}/${date.getDate()}まで)`;
}
