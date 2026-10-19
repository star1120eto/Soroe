// TMPL-004 / AC-04「テンプレート」の通し確認(Firebase Emulator上の1ユーザー)。
//
// 実際のFirebase Client SDK(アプリが使うRules・Callable Functionsと同じ経路)で、
// 「公式テンプレートから不要項目を除いて作成→リストをマイテンプレートへ保存→Freeの2件目は上限→
// 元のリスト・元の公式テンプレートを変えても保存済み・作成済みは変わらない→マイテンプレートから作成」を通す。
//
// 使い方(リポジトリルートで。公式テンプレートを投入してから実行する):
//   pnpm run build:shared && pnpm run build:functions
//   firebase emulators:exec --only auth,firestore,functions \
//     'pnpm run templates:seed && pnpm --filter mobile run e2e:templates'
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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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

const itemsOf = async (client, listId) =>
  (await getDocs(collection(client.db, 'lists', listId, 'items'))).docs
    .map((d) => d.data())
    .filter((item) => item.deletedAt === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

// Emulatorのrules-bypass(Bearer owner)で、公式テンプレートを直接書き換える(アプリからは書けない)。
async function patchOfficial(path, fields, maskPaths) {
  const mask = maskPaths.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join('&');
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?${mask}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ fields }),
    }
  );
  assert(response.ok, `公式テンプレートの書換えに失敗(${response.status})`);
}

async function main() {
  const a = createClient('user-a');

  console.log(`AC-04 テンプレート(Emulator・1ユーザー、試行${attempt}回目)`);
  const uid = await signUp(a, 'たろう');

  let officialItems;
  let officialListId;
  let templateId;
  let savedItemNames;

  await step('公開済みの公式テンプレート10件と、day-hikeの項目を読める', async () => {
    // 一覧は published == true で絞ったクエリに限り読める(Rules)。アプリの購読と同じ。
    const published = (await getDocs(query(collection(a.db, 'officialTemplates'), where('published', '==', true)))).docs;
    assert(published.length === 10, `公開済みが10件(実際: ${published.length})`);
    officialItems = (await getDocs(collection(a.db, 'officialTemplates', 'day-hike', 'items'))).docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((x, y) => x.sortOrder - y.sortOrder);
    assert(officialItems.length >= 8, 'day-hikeに項目がある');
  });

  await step('公式テンプレートから不要項目(地図)を除いて作成できる。人数補正は人数ごとの項目だけ', async () => {
    const itemIds = officialItems.filter((item) => item.id !== 'map').map((item) => item.id);
    const response = await a.call('createListFromTemplate', {
      source: 'official',
      templateId: 'day-hike',
      itemIds,
      partySize: 3,
      language: 'ja',
      requestId: randomUUID(),
    });
    officialListId = response.listId;
    const list = (await getDoc(doc(a.db, 'lists', officialListId))).data();
    assert(list.name === '日帰り登山' && list.ownerId === uid, 'リストが日本語の名称で作られる');
    const items = await itemsOf(a, officialListId);
    assert(items.length === itemIds.length, '選んだ項目だけが入る');
    assert(!items.some((item) => item.name === '地図'), '外した項目は入らない');
    const water = items.find((item) => item.name === '水');
    assert(water.quantity === 3, `人数ごとの数量が人数倍(実際: ${water.quantity})`);
    const headlamp = items.find((item) => item.name === 'ヘッドライト');
    assert(headlamp.quantity === 3, 'ヘッドライトも人数倍');
    const firstAid = items.find((item) => item.name === '救急セット');
    assert(firstAid.quantity === null, '数量が未設定の項目は未設定のまま');
    assert(items.every((item) => item.completedAt === null && item.assigneeId === null), '完了・担当は引き継がない');
  });

  await step('リストをマイテンプレートに保存できる(共有・担当・完了者・履歴は保存されない)', async () => {
    // 一部を完了にして、初期チェック状態として残ることも確認する。
    const firstItem = (await getDocs(collection(a.db, 'lists', officialListId, 'items'))).docs[0];
    await updateDoc(firstItem.ref, { completedAt: serverTimestamp(), completedBy: uid, assigneeId: uid, updatedAt: serverTimestamp() });

    const response = await a.call('saveMyTemplate', {
      listId: officialListId,
      title: '登山の持ち物',
      description: '家族用',
      requestId: randomUUID(),
    });
    templateId = response.templateId;
    const saved = (await getDoc(doc(a.db, 'users', uid, 'myTemplates', templateId))).data();
    assert(saved.title === '登山の持ち物' && saved.itemCount === saved.items.length, '保存された');
    assert(saved.items.some((item) => item.checked === true), '完了状態が初期チェックとして残る');
    assert(saved.items.every((item) => !('assigneeId' in item) && !('completedBy' in item) && !('createdBy' in item)), '担当者・完了者・作成者を保存しない');
    savedItemNames = saved.items.map((item) => item.name);
  });

  await step('Freeユーザーの2件目の保存は上限(resource-exhausted)になる', async () => {
    await expectError(
      a.call('saveMyTemplate', { listId: officialListId, title: '2件目', description: null, requestId: randomUUID() }),
      'resource-exhausted',
      '2件目の保存'
    );
    const templates = await getDocs(collection(a.db, 'users', uid, 'myTemplates'));
    assert(templates.size === 1, 'マイテンプレートは1件のまま');
  });

  await step('保存後に元のリストを変更・削除しても、保存済みの内容は変わらない', async () => {
    const [first, second] = (await getDocs(collection(a.db, 'lists', officialListId, 'items'))).docs;
    await updateDoc(first.ref, { name: '変更した項目', updatedAt: serverTimestamp() });
    await updateDoc(second.ref, { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await updateDoc(doc(a.db, 'lists', officialListId), { name: '名前を変えたリスト', updatedAt: serverTimestamp() });

    const saved = (await getDoc(doc(a.db, 'users', uid, 'myTemplates', templateId))).data();
    assert(JSON.stringify(saved.items.map((item) => item.name)) === JSON.stringify(savedItemNames), '保存済みの項目は不変');
    assert(saved.title === '登山の持ち物', '保存済みのタイトルは不変');
  });

  await step('マイテンプレートからリストを作成できる(初期チェック状態も引き継ぐ)', async () => {
    const saved = (await getDoc(doc(a.db, 'users', uid, 'myTemplates', templateId))).data();
    const response = await a.call('createListFromTemplate', {
      source: 'my',
      templateId,
      itemIds: saved.items.map((item) => item.id),
      language: 'ja',
      requestId: randomUUID(),
    });
    const list = (await getDoc(doc(a.db, 'lists', response.listId))).data();
    assert(list.name === '登山の持ち物', 'マイテンプレートの名称で作られる');
    const items = await itemsOf(a, response.listId);
    assert(JSON.stringify(items.map((item) => item.name)) === JSON.stringify(savedItemNames), '保存した項目がそのまま入る');
    assert(items.some((item) => item.completedAt !== null), '初期チェック状態が完了として入る');
  });

  await step('元の公式テンプレートを後から変更しても、作成済みのリストは変わらない', async () => {
    await patchOfficial(
      'officialTemplates/day-hike',
      { ja: { mapValue: { fields: { title: { stringValue: '変更後の公式タイトル' } } } } },
      ['ja.title']
    );
    const list = (await getDoc(doc(a.db, 'lists', officialListId))).data();
    assert(list.name === '名前を変えたリスト', '公式の変更が作成済みのリストへ波及しない');
  });

  await step('Rules: マイテンプレートはクライアントから作成できず、項目を増やす更新も拒否される。名前変更・項目を減らす更新は通る', async () => {
    await expectError(
      setDoc(doc(a.db, 'users', uid, 'myTemplates', 'forged'), {
        title: '偽造', description: null, listType: 'packing', icon: 'suitcase', color: 'primary', itemCount: 0, items: [],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }),
      'permission-denied',
      'マイテンプレートの直接作成'
    );
    const ref = doc(a.db, 'users', uid, 'myTemplates', templateId);
    const saved = (await getDoc(ref)).data();
    await expectError(
      updateDoc(ref, {
        items: [...saved.items, { id: 'x', name: '増やした項目', quantity: null, unit: null, category: null, note: null, checked: false }],
        itemCount: saved.items.length + 1,
        updatedAt: serverTimestamp(),
      }),
      'permission-denied',
      '項目を増やす更新'
    );
    await updateDoc(ref, { title: '名前変更後', updatedAt: serverTimestamp() });
    await updateDoc(ref, { items: saved.items.slice(1), itemCount: saved.items.length - 1, updatedAt: serverTimestamp() });
    const after = (await getDoc(ref)).data();
    assert(after.title === '名前変更後' && after.itemCount === saved.items.length - 1, '名前変更と項目の削除が反映される');
  });

  await step('Freeのリスト上限(3件)を超える作成は拒否され、リストが増えない', async () => {
    // ここまでで2件(公式から1件・マイから1件)。3件目は通り、4件目は拒否される。
    await a.call('createListFromTemplate', {
      source: 'official', templateId: 'camping', itemIds: [], language: 'ja', requestId: randomUUID(),
    });
    await expectError(
      a.call('createListFromTemplate', { source: 'official', templateId: 'camping', itemIds: [], language: 'ja', requestId: randomUUID() }),
      'resource-exhausted',
      '4件目のリスト作成'
    );
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
