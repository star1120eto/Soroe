import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

const COLLECTION = "emailOtps";

export type OtpRecord = {
  codeHash: string;
  createdAtMs: number;
  expiresAtMs: number;
  attempts: number;
};

function docRef(email: string) {
  return getFirestore().collection(COLLECTION).doc(email);
}

export async function getOtpRecord(email: string): Promise<OtpRecord | null> {
  const snap = await docRef(email).get();
  if (!snap.exists) {
    return null;
  }
  const data = snap.data() as {
    codeHash: string;
    createdAt: Timestamp;
    expiresAt: Timestamp;
    attempts: number;
  };
  return {
    codeHash: data.codeHash,
    createdAtMs: data.createdAt.toMillis(),
    expiresAtMs: data.expiresAt.toMillis(),
    attempts: data.attempts,
  };
}

export async function saveOtpRecord(
  email: string,
  record: { codeHash: string; createdAtMs: number; expiresAtMs: number }
): Promise<void> {
  await docRef(email).set({
    codeHash: record.codeHash,
    createdAt: Timestamp.fromMillis(record.createdAtMs),
    expiresAt: Timestamp.fromMillis(record.expiresAtMs),
    attempts: 0,
  });
}

export async function incrementOtpAttempts(email: string): Promise<void> {
  await docRef(email).update({ attempts: FieldValue.increment(1) });
}

export async function deleteOtpRecord(email: string): Promise<void> {
  await docRef(email).delete();
}
