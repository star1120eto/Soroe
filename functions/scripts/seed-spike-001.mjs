// SPIKE-001の前提データを作る。リスト作成とメンバー追加はCallable Functions
// (LIST-002/SHARE-001)のスコープでまだ実装されていないため、検証準備として
// Admin SDKでRulesを迂回して直接書き込む。
//
// 使い方(Firestore/Auth Emulatorを起動した状態で):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   node scripts/seed-spike-001.mjs <uidA> <uidB>

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const LIST_ID = 'spike-001';

const [uidA, uidB] = process.argv.slice(2);
if (!uidA || !uidB) {
  console.error('usage: node scripts/seed-spike-001.mjs <uidA> <uidB>');
  process.exit(1);
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is required (this script only seeds the emulator)');
  process.exit(1);
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'soroe-1850a' });
const db = getFirestore();

const listRef = db.doc(`lists/${LIST_ID}`);
await listRef.set({
  name: 'SPIKE-001 検証リスト',
  type: 'shopping',
  color: 'primary',
  icon: 'ph:shopping-cart-simple',
  ownerId: uidA,
  createdBy: uidA,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  archivedAt: null,
  deletedAt: null,
});

await Promise.all([
  db.doc(`lists/${LIST_ID}/members/${uidA}`).set({
    role: 'owner',
    joinedAt: FieldValue.serverTimestamp(),
  }),
  db.doc(`lists/${LIST_ID}/members/${uidB}`).set({
    role: 'editor',
    joinedAt: FieldValue.serverTimestamp(),
  }),
]);

// 一覧画面用の非正規化参照。集計値の更新はサーバー側の責務(SHARE-001)。
const listRefPayload = {
  name: 'SPIKE-001 検証リスト',
  type: 'shopping',
  color: 'primary',
  icon: 'ph:shopping-cart-simple',
  totalCount: 0,
  completedCount: 0,
  memberCount: 2,
  updatedAt: FieldValue.serverTimestamp(),
  archivedAt: null,
};
await Promise.all([
  db.doc(`users/${uidA}/listRefs/${LIST_ID}`).set({ ...listRefPayload, role: 'owner' }),
  db.doc(`users/${uidB}/listRefs/${LIST_ID}`).set({ ...listRefPayload, role: 'editor' }),
]);

console.log(`seeded lists/${LIST_ID} with members: ${uidA} (owner), ${uidB} (editor)`);
process.exit(0);
