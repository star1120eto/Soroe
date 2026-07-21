import { onCall } from "firebase-functions/v2/https";

export function pingHandler() {
  return { ok: true };
}

export const ping = onCall(() => pingHandler());
