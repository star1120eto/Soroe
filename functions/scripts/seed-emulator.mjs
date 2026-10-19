// ローカルEmulator用のテストデータ投入。指定したメールのユーザーを所有者として、
// 種類(買い物/持ち物/タスク)の違うリスト・項目・招待リンクを作る。
//
// 使い方(リポジトリルートで。Emulatorは docker compose up / firebase emulators:start で起動済み):
//   pnpm run seed -- a@example.test
//   pnpm run seed -- a@example.test --name たろう
//
// - リストはアプリと同じCallable(createList / archiveList / createInvite)で作るため、
//   members・listRefs・件数集計がアプリの経路どおりに整う。項目だけAdmin SDKで直接書く。
// - ユーザーが未作成ならAuthに作り、プロフィールも用意する(メールOTPでログインすると、そのまま一覧へ進む)。
// - 同名のリストが既にあれば作らない(繰り返し実行しても増えない)。Freeプランのアクティブリスト上限
//   (3件)に達したら残りはスキップする。作り直すときはEmulatorを作り直す。
// - Emulator以外には接続しない(接続先は 127.0.0.1 の既定ポート。環境変数で上書き可)。

import { randomBytes, randomUUID } from 'node:crypto';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'soroe-1850a';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const WEB_ORIGIN = process.env.SEED_WEB_ORIGIN ?? 'http://localhost:8082';

// admin SDKを読み込む前に、Emulator宛てに固定する(本番へ誤接続しない)。
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;

const { initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const nameFlag = args.indexOf('--name');
const displayName = nameFlag >= 0 ? args[nameFlag + 1] : undefined;
const email = args.find((arg, index) => !arg.startsWith('--') && (nameFlag < 0 || index !== nameFlag + 1));
if (!email) {
  console.error('使い方: pnpm run seed -- <メールアドレス> [--name 表示名]');
  process.exit(1);
}

initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

// [名前, 完了済みか]
// Freeプランのアクティブリスト上限(3)に収まるよう、アーカイブ済みを先に作ってすぐアーカイブする。
const LISTS = [
  { name: '去年の旅行(アーカイブ済み)', type: 'packing', color: 'primary', icon: 'suitcase', items: [['パスポート', true]], archive: true },
  {
    name: '今週の買い物',
    type: 'shopping',
    color: 'primary',
    icon: 'shopping-cart-simple',
    items: [
      ['牛乳', false],
      ['卵', false],
      ['食パン', true],
      ['トマト', false],
      ['洗剤', true],
    ],
  },
  {
    name: '週末のキャンプ',
    type: 'packing',
    color: 'accent',
    icon: 'suitcase',
    items: [
      ['テント', false],
      ['寝袋', false],
      ['ランタン', true],
      ['クーラーボックス', false],
    ],
    invites: 2,
  },
  {
    name: '引っ越しのタスク',
    type: 'task',
    color: 'warning',
    icon: 'check',
    items: [
      ['転出届を出す', true],
      ['電気・ガスの手続き', false],
      ['郵便の転送届', false],
    ],
  },
];

async function idTokenFor(uid) {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!body.idToken) {
    throw new Error(`Authエミュレータへ接続できません(${AUTH_HOST}): ${JSON.stringify(body)}`);
  }
  return body.idToken;
}

async function call(name, idToken, data) {
  const res = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT_ID}/us-central1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(`${name} 失敗: ${JSON.stringify(body.error)}`);
  }
  return body.result;
}

let user;
try {
  user = await auth.getUserByEmail(email);
} catch {
  user = await auth.createUser({ email, emailVerified: true, displayName });
  console.log(`ユーザーを作成しました: ${email}`);
}
// アプリが読むプロフィール(users/{uid})を、欠けている項目だけ補って完全にする。
// 表示名・言語・作成日時が揃っていないと、ログイン直後にアプリが読み込みに失敗する。
// createListはこのdisplayNameをオーナーの表示名にする。
const profileRef = db.doc(`users/${user.uid}`);
const existing = (await profileRef.get()).data() ?? {};
const missing = {};
if (!existing.displayName) {
  missing.displayName = displayName ?? user.displayName ?? email.split('@')[0];
}
if (!existing.language) {
  missing.language = 'ja';
}
if (!existing.createdAt) {
  missing.createdAt = FieldValue.serverTimestamp();
}
if (Object.keys(missing).length > 0) {
  await profileRef.set(missing, { merge: true });
}

const idToken = await idTokenFor(user.uid);
const now = FieldValue.serverTimestamp();
const inviteUrls = [];

for (const spec of LISTS) {
  // 同名のリストが(削除されずに)既にあれば作らない。繰り返し実行しても増えない。
  const sameName = await db.collection('lists').where('ownerId', '==', user.uid).where('name', '==', spec.name).get();
  if (sameName.docs.some((snapshot) => snapshot.data().deletedAt == null)) {
    console.log(`スキップ(作成済み): ${spec.name}`);
    continue;
  }
  let listId;
  try {
    ({ listId } = await call('createList', idToken, {
      name: spec.name,
      type: spec.type,
      color: spec.color,
      icon: spec.icon,
      requestId: randomUUID(),
    }));
  } catch (error) {
    if (String(error.message).includes('RESOURCE_EXHAUSTED')) {
      console.log(`スキップ(Freeプランのアクティブリスト上限): ${spec.name}`);
      continue;
    }
    throw error;
  }
  let sortOrder = 1000;
  for (const [itemName, done] of spec.items) {
    await db.collection(`lists/${listId}/items`).add({
      name: itemName,
      quantity: null,
      unit: null,
      category: null,
      note: null,
      assigneeId: null,
      dueAt: null,
      completedAt: done ? now : null,
      completedBy: done ? user.uid : null,
      sortOrder,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    sortOrder += 1000;
  }
  for (let index = 0; index < (spec.invites ?? 0); index += 1) {
    const token = randomBytes(32).toString('hex');
    await call('createInvite', idToken, { listId, token });
    inviteUrls.push(`${WEB_ORIGIN}/invite/${token}  (${spec.name})`);
  }
  if (spec.archive) {
    await call('archiveList', idToken, { listId });
  }
  console.log(`リストを作成: ${spec.name} (${spec.items.length}件)`);
}

console.log(`\n完了。所有者: ${email}`);
if (inviteUrls.length > 0) {
  console.log('\n招待リンク(1回のみ有効。別オリジンのブラウザで開き、別メールでログインして参加):');
  for (const url of inviteUrls) {
    console.log(`  ${url}`);
  }
}
