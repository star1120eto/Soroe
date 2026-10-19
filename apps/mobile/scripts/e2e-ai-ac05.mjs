// AI-005 / AC-05「AI生成」の通し確認(Firebase Emulator上、偽のAIクライアント)。
//
// 実際のFirebase Client SDK(アプリが使うRules・Callable Functionsと同じ経路)で、
// 「条件から最大80件のプレビュー→編集して保存→Freeは生涯1回→失敗・安全拒否・キャンセルで回数が戻る→
// 同じrequestIdの再送で二重に数えない→同時生成は1件→他人の結果は読めない」を通す。
// 実際のOpenAI APIは使わない(AI_CLIENT=fake の偽クライアント。notesの合言葉で失敗・拒否・遅延を再現する)。
//
// 使い方(リポジトリルートで。Functionsをビルドしておく):
//   pnpm run build:shared && pnpm run build:functions
//   AI_CLIENT=fake firebase emulators:exec --only auth,firestore,functions \
//     'pnpm --filter mobile run e2e:ai'
//
// Emulator以外には接続しない(環境変数が無ければ即座に終了する)。

import { randomUUID } from 'node:crypto';

import { deleteApp, initializeApp, onLog } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'soroe-1850a';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ?? process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
if (!firestoreHost || !authHost) {
  console.error('FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST が未設定です。emulators:exec 経由で実行してください');
  process.exit(1);
}
if (process.env.AI_CLIENT !== 'fake') {
  console.error('AI_CLIENT=fake を付けて実行してください(Functions Emulatorが偽のAIクライアントで起動している必要があります)');
  process.exit(1);
}
const [fsHost, fsPort] = firestoreHost.split(':');
const [fnHost, fnPort] = functionsHost.split(':');

let attempt = 1;
const createdApps = [];

function createClient(name) {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT_ID, authDomain: 'localhost' }, `${name}-${attempt}`);
  createdApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, fnHost, Number(fnPort));
  const call = async (functionName, data) => (await httpsCallable(functions, functionName)(data)).data;
  return { auth, db, call };
}

async function signUp(client, displayName) {
  const email = `${displayName}-${randomUUID()}@example.test`;
  const credential = await createUserWithEmailAndPassword(client.auth, email, 'test-password-123');
  const uid = credential.user.uid;
  await setDoc(doc(client.db, 'users', uid), { displayName, language: 'ja', createdAt: serverTimestamp() });
  return uid;
}

const results = [];
async function step(name, run) {
  const startedAt = Date.now();
  try {
    await run();
    results.push({ name, ok: true, ms: Date.now() - startedAt });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - startedAt, error });
    console.log(`  ✗ ${name}\n      ${error?.message ?? error}`);
    throw error;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

async function waitFor(description, read, predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await read();
    if (predicate(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${description} (last: ${JSON.stringify(last)})`);
}

async function expectError(promise, code, description) {
  try {
    await promise;
  } catch (error) {
    const actual = error?.code ?? '';
    assert(actual.endsWith(code), `${description}: expected ${code}, got ${actual}`);
    return;
  }
  throw new Error(`${description}: expected ${code} but it succeeded`);
}

const input = (overrides = {}) => ({
  useCase: 'hiking', customText: null, adults: 2, children: 1, ageBands: ['elementary'], nights: 0,
  season: 'autumn', features: ['beginner'], notes: null, language: 'ja', ...overrides,
});
const generate = (client, requestId, overrides) => client.call('generateList', { requestId, input: input(overrides) });
const remaining = async (client) => (await client.call('getAiQuota', undefined)).remaining;
const requestDoc = async (client, uid, requestId) => (await getDoc(doc(client.db, 'aiRequests', `${uid}_${requestId}`))).data();

// Emulatorのrules-bypass(Bearer owner)で、Premiumの権利を直接入れる(アプリからは書けない)。
async function grantPremium(uid) {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${PROJECT_ID}/databases/(default)/documents/entitlements/${uid}?updateMask.fieldPaths=plan`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ fields: { plan: { stringValue: 'premium' } } }),
    }
  );
  assert(response.ok, `Premiumの付与に失敗(${response.status})`);
}

async function main() {
  const a = createClient('user-a');
  const b = createClient('user-b');
  const c = createClient('user-c');
  const d = createClient('user-d');

  console.log(`AC-05 AI生成(Emulator・偽のAIクライアント、試行${attempt}回目)`);
  const uidA = await signUp(a, 'たろう');
  const uidB = await signUp(b, 'はなこ');
  const uidC = await signUp(c, 'じろう');
  const uidD = await signUp(d, 'さぶろう');

  const requestA = randomUUID();
  let generated;
  let savedListId;

  await step('条件から、最大80件の構造化されたプレビューを生成できる(AC-05 ①)', async () => {
    const quota = await a.call('getAiQuota', undefined);
    assert(quota.plan === 'free' && quota.remaining === 1 && quota.resetsAt === null, 'Freeは生涯1回、最初は残り1回');

    const response = await generate(a, requestA);
    assert(response.status === 'succeeded', `生成に成功する(実際: ${response.status})`);
    generated = response.result;
    assert(generated.items.length >= 5 && generated.items.length <= 80, `項目が1〜80件(実際: ${generated.items.length})`);
    assert(generated.safetyNotice === true, '登山は安全注意が付く');
    const water = generated.items.find((item) => item.name === '水');
    assert(water.quantity === 3, `人数(3人)が数量に反映される(実際: ${water.quantity})`);

    const stored = await requestDoc(a, uidA, requestA);
    assert(stored.status === 'succeeded' && stored.uid === uidA, '生成結果が aiRequests に残る');
    assert((await remaining(a)) === 0, '成功で回数が1回使われる');
  });

  await step('同じrequestIdの再送で、二重に数えず同じ結果を返す(AC-05 ⑤)', async () => {
    const again = await generate(a, requestA);
    assert(again.status === 'succeeded' && again.result.title === generated.title, '同じ結果が返る');
    const quota = await a.call('getAiQuota', undefined);
    assert(quota.used === 1, `回数は1のまま(実際: ${quota.used})`);
  });

  await step('項目を編集・除外して、通常のリストとして保存できる(AC-05 ②)。再送でリストは増えない', async () => {
    const items = generated.items.slice(1).map((item, index) => (index === 0 ? { ...item, name: '編集した項目' } : item));
    const response = await a.call('saveAiResult', { requestId: requestA, title: '家族の登山', listType: 'packing', items });
    assert(response.status === 'saved', `保存できる(実際: ${response.status})`);
    savedListId = response.listId;

    const list = (await getDoc(doc(a.db, 'lists', savedListId))).data();
    assert(list.name === '家族の登山' && list.ownerId === uidA, '編集後のタイトルで、本人がownerのリストになる');
    const saved = (await getDocs(collection(a.db, 'lists', savedListId, 'items'))).docs.map((d) => d.data());
    assert(saved.length === items.length, `編集後の項目だけが入る(${saved.length}/${items.length})`);
    assert(saved.some((item) => item.name === '編集した項目'), '編集した名前が入る');
    assert(!saved.some((item) => item.name === generated.items[0].name), '除外した項目は入らない');

    const again = await a.call('saveAiResult', { requestId: requestA, title: '家族の登山', listType: 'packing', items });
    assert(again.status === 'saved' && again.listId === savedListId, '再送は同じリストを返す');
  });

  await step('Freeの2回目の生成は上限(limit-reached)になる(AC-05 ③)', async () => {
    const response = await generate(a, randomUUID());
    assert(response.status === 'limit-reached', `上限になる(実際: ${response.status})`);
    assert(response.quota.remaining === 0 && response.quota.plan === 'free', '残り0回の情報が付く');
  });

  await step('結果を評価できる。他人の生成結果は読めない', async () => {
    const rated = await a.call('rateAiResult', { requestId: requestA, rating: 'helpful' });
    assert(rated.ok === true, '評価できる');
    assert((await requestDoc(a, uidA, requestA)).rating === 'helpful', '評価が保存される');

    await expectError(getDoc(doc(b.db, 'aiRequests', `${uidA}_${requestA}`)), 'permission-denied', '他人の生成結果の読取');
  });

  await step('安全拒否・失敗・形式不正では、回数が戻る(AC-05 ④)', async () => {
    const refused = await generate(b, randomUUID(), { notes: 'REFUSE' });
    assert(refused.status === 'refused', `安全拒否になる(実際: ${refused.status})`);
    assert((await remaining(b)) === 1, '安全拒否で回数が戻る');

    const failed = await generate(b, randomUUID(), { notes: 'FAIL' });
    assert(failed.status === 'failed', `失敗になる(実際: ${failed.status})`);
    assert((await remaining(b)) === 1, '失敗で回数が戻る');

    const badFormat = await generate(b, randomUUID(), { notes: 'BADFORMAT' });
    assert(badFormat.status === 'failed', `形式不正は失敗になる(実際: ${badFormat.status})`);
    assert((await remaining(b)) === 1, '形式不正で回数が戻る');

    const ok = await generate(b, randomUUID());
    assert(ok.status === 'succeeded', '戻した回数で、改めて生成できる');
    assert((await remaining(b)) === 0, '成功で使い切る');
  });

  await step('80件を超える結果は80件に整形され、重複も除かれる', async () => {
    const response = await generate(d, randomUUID(), { notes: 'MANY' });
    assert(response.status === 'succeeded', '生成できる');
    assert(response.result.items.length === 80, `80件に整形される(実際: ${response.result.items.length})`);
    const names = response.result.items.map((item) => item.name.toLowerCase().replace(/\s+/g, ''));
    assert(new Set(names).size === names.length, '重複がない');
  });

  await step('同時に生成できるのは1件。予約中のキャンセルで回数が戻る', async () => {
    const slowRequest = randomUUID();
    // 遅い生成を待たずに始める(キャンセル後、サーバー側は約1分で打ち切られる)。
    const slow = generate(c, slowRequest, { notes: 'SLOW' }).catch(() => null);
    await waitFor('予約中になる', async () => (await requestDoc(c, uidC, slowRequest))?.status, (status) => status === 'reserved');

    const second = await generate(c, randomUUID());
    assert(second.status === 'busy', `生成中の2件目は busy(実際: ${second.status})`);

    const cancelled = await c.call('cancelGeneration', { requestId: slowRequest });
    assert(cancelled.status === 'cancelled', 'キャンセルできる');
    assert((await requestDoc(c, uidC, slowRequest)).status === 'cancelled', '状態が cancelled になる');
    assert((await remaining(c)) === 1, 'キャンセルで回数が戻る');

    const again = await c.call('cancelGeneration', { requestId: slowRequest });
    assert(again.status === 'already-finished', 'キャンセル済みへの再度のキャンセルは何もしない');
    void slow;
  });

  await step('Premiumは月の回数(20回)として数える', async () => {
    await grantPremium(uidD);
    const quota = await d.call('getAiQuota', undefined);
    assert(quota.plan === 'premium' && quota.limit === 20, 'Premiumは月20回');
    assert(typeof quota.resetsAt === 'number' && quota.resetsAt > Date.now(), '次回のリセット日時が付く');
    assert(quota.used === 0, 'Freeとして使った回数は引き継がない');

    const response = await generate(d, randomUUID());
    assert(response.status === 'succeeded', 'Premiumとして生成できる');
    assert((await remaining(d)) === 19, '月の残りが19回になる');
  });
}

// Node版gRPCの通信の乱れ(`RESOURCE_EXHAUSTED: Received message larger than max`)を検出したときだけ、
// 新しいクライアントで全体をやり直す(アサーションの失敗は再試行しない)。
let transportGlitch = false;
onLog((log) => {
  if (/RESOURCE_EXHAUSTED|Received message larger than max/.test(log.message ?? '')) {
    transportGlitch = true;
  }
});

const MAX_ATTEMPTS = 3;

function isTransportFailure(error) {
  return transportGlitch || (error?.code === 'unavailable' && /offline/i.test(error?.message ?? ''));
}

async function disposeClients() {
  await Promise.allSettled(createdApps.splice(0).map((app) => deleteApp(app)));
}

async function runWithRetry() {
  for (;;) {
    try {
      await main();
      return;
    } catch (error) {
      await disposeClients();
      if (!isTransportFailure(error) || attempt >= MAX_ATTEMPTS) {
        throw error;
      }
      console.warn(`\n⚠ Firestoreクライアントの通信障害(${error.message})。新しいクライアントで1回だけ再試行します\n`);
      results.length = 0;
      transportGlitch = false;
      attempt += 1;
    }
  }
}

runWithRetry()
  .then(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} 件成功`);
    process.exit(failed.length === 0 ? 0 : 1);
  })
  .catch((error) => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} 件成功(失敗あり)`);
    console.error(error);
    process.exit(1);
  });
