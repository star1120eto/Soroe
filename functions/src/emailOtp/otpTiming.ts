export function isWithinCooldown(createdAtMs: number, nowMs: number, cooldownSeconds: number): boolean {
  return nowMs - createdAtMs < cooldownSeconds * 1000;
}

export function isExpired(expiresAtMs: number, nowMs: number): boolean {
  return nowMs >= expiresAtMs;
}
