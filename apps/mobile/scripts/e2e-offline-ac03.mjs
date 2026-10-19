// OFF-003 / AC-03「オフライン」の通し確認(Firebase Emulator上の2ユーザー)。
//
// 実機・シミュレーターでの機内モード確認はENV-002(Apple Developer Program未登録)のため行えない。
// 代わりに、アプリが使うのと同じFirestoreのクライアントSDKで disableNetwork() / enableNetwork() を
// 呼んで機内モードを再現し、「オフラインの追加・編集・完了・削除→復帰後の同期→別端末への反映」と
// 「同時編集の競合(別項目・同じ項目・削除対編集)」を通す。
//
// 使い方(リポジトリルートで。Functionsをビルドしておく):
//   pnpm run build:shared && pnpm run build:functions
//   firebase emulators:exec --only auth,firestore,functions \
//     'pnpm --filter mobile run e2e:offline'
//
// Emulator以外には接続しない(環境変数が無ければ即座に終了する)。

import { randomBytes, randomUUID } from 'node:crypto';

import { deleteApp, initializeApp, onLog } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  disableNetwork,
  doc,
  enableNetwork,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
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

// 再試行(runWithRetry)で新しいクライアントを作り直せるよう、試行ごとに別名のappにする。
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

function newItem(name, createdBy, sortOrder) {
  return {
    name,
    quantity: null,
    unit: null,
    category: null,
    note: null,
    assigneeId: null,
    dueAt: null,
    completedAt: null,
    completedBy: null,
    sortOrder,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deletedAt: null,
  };
}

// アプリのリスト詳細と同じく、includeMetadataChanges付きで項目の購読を持つ。
function watchItems(client, listId) {
  const items = new Map(); // itemId -> { data, pending }
  const meta = { fromCache: true };
  const unsubscribe = onSnapshot(
    collection(client.db, 'lists', listId, 'items'),
    { includeMetadataChanges: true },
    (snapshot) => {
      meta.fromCache = snapshot.metadata.fromCache;
      items.clear();
      snapshot.docs.forEach((d) =>
        items.set(d.id, { data: d.data({ serverTimestamps: 'estimate' }), pending: d.metadata.hasPendingWrites })
      );
    }
  );
  return { items, meta, unsubscribe };
}

const itemRef = (client, listId, itemId) => doc(client.db, 'lists', listId, 'items', itemId);
const touch = (fields) => ({ ...fields, updatedAt: serverTimestamp() });
const anyPending = (watcher) => [...watcher.items.values()].some((item) => item.pending);

// 復帰した直後にまた接続を切ると、Node版のgRPCが壊れて以降の受信が止まることがある(通信の乱れ。
// アプリの不具合ではない)。復帰したら、購読がサーバーの状態に追いつくまで待ってから次へ進む。
async function settle(...watchers) {
  await waitFor('購読がサーバーに追いつく', async () => watchers.every((w) => !w.meta.fromCache && !anyPending(w)), (ok) => ok);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// オフライン中の書込は、サーバーに届くまで解決しない。ここでは待たずにPromiseだけ控える。
const queued = [];
function queue(promise) {
  queued.push(promise);
}
async function flushQueued() {
  await Promise.all(queued.splice(0));
}

async function main() {
  const a = createClient('user-a');
  const b = createClient('user-b');

  console.log(`AC-03 オフライン(Emulator・2ユーザー、試行${attempt}回目)`);
  const uidA = await signUp(a, 'たろう');
  const uidB = await signUp(b, 'はなこ');

  let listId;
  const watchA = { items: new Map(), meta: { fromCache: true }, unsubscribe: () => {} };
  const watchB = { items: new Map(), meta: { fromCache: true }, unsubscribe: () => {} };
  const watchers = [];

  try {
    await step('準備: AがリストをつくりBを招待、Bが参加する', async () => {
      const response = await a.call('createList', {
        name: '週末のキャンプ',
        type: 'packing',
        color: 'primary',
        icon: 'suitcase',
        requestId: randomUUID(),
      });
      listId = response.listId;
      const token = randomBytes(32).toString('hex');
      await a.call('createInvite', { listId, token });
      await b.call('acceptInvite', { token, requestId: randomUUID() });
      for (const [client, holder] of [[a, watchA], [b, watchB]]) {
        const watcher = watchItems(client, listId);
        holder.items = watcher.items;
        holder.meta = watcher.meta;
        holder.unsubscribe = watcher.unsubscribe;
        watchers.push(watcher);
      }
    });

    await step('オフラインの追加・編集・完了・削除が、即座にローカルへ反映され未同期になる', async () => {
      await disableNetwork(a.db);
      queue(setDoc(itemRef(a, listId, 'i1'), newItem('牛乳', uidA, 1000)));
      queue(setDoc(itemRef(a, listId, 'i2'), newItem('卵', uidA, 2000)));
      queue(setDoc(itemRef(a, listId, 'i3'), newItem('パン', uidA, 3000)));
      queue(updateDoc(itemRef(a, listId, 'i1'), touch({ note: '低脂肪' })));
      queue(updateDoc(itemRef(a, listId, 'i2'), touch({ completedAt: serverTimestamp(), completedBy: uidA })));
      queue(updateDoc(itemRef(a, listId, 'i3'), touch({ deletedAt: serverTimestamp() })));

      const local = await waitFor('Aのローカルに全ての変更', async () => watchA.items, (items) => items.size === 3);
      assert(local.get('i1').data.note === '低脂肪', '編集がローカルに反映される');
      assert(local.get('i2').data.completedAt !== null, '完了がローカルに反映される');
      assert(local.get('i3').data.deletedAt !== null, '削除(論理削除)がローカルに反映される');
      assert(anyPending(watchA), '未同期(hasPendingWrites)になる');
      assert(watchB.items.size === 0, '復帰前はBに届かない');
    });

    await step('復帰後に自動で同期され、別のクライアントへ届く', async () => {
      await enableNetwork(a.db);
      await flushQueued();
      await settle(watchA, watchB);
      await waitFor('Aの未同期が解消', async () => anyPending(watchA), (pending) => pending === false);
      const seen = await waitFor('Bに3件', async () => watchB.items, (items) => items.size === 3);
      assert(seen.get('i1').data.note === '低脂肪', 'Bに編集が届く');
      assert(seen.get('i2').data.completedAt !== null, 'Bに完了が届く');
      assert(seen.get('i3').data.deletedAt !== null, 'Bに削除が届く');
    });

    await step('別の項目を同時にオフラインで変更しても、両方残る', async () => {
      await Promise.all([disableNetwork(a.db), disableNetwork(b.db)]);
      queue(updateDoc(itemRef(a, listId, 'i1'), touch({ name: 'Aが変更した牛乳' })));
      queue(updateDoc(itemRef(b, listId, 'i2'), touch({ name: 'Bが変更した卵' })));
      await Promise.all([enableNetwork(a.db), enableNetwork(b.db)]);
      await flushQueued();
      await settle(watchA, watchB);
      for (const [label, watcher] of [['A', watchA], ['B', watchB]]) {
        const seen = await waitFor(`${label}に両方の変更`, async () => watcher.items, (items) =>
          items.get('i1')?.data.name === 'Aが変更した牛乳' && items.get('i2')?.data.name === 'Bが変更した卵'
        );
        assert(seen.size === 3, `${label}: 項目が失われない`);
      }
    });

    await step('同じ項目の別フィールドを同時に変更しても両方残る。同じフィールドは後に届いた値へ収束する', async () => {
      await Promise.all([disableNetwork(a.db), disableNetwork(b.db)]);
      queue(updateDoc(itemRef(a, listId, 'i1'), touch({ note: 'Aのメモ' })));
      queue(updateDoc(itemRef(b, listId, 'i1'), touch({ category: 'Bのカテゴリ' })));
      await Promise.all([enableNetwork(a.db), enableNetwork(b.db)]);
      await flushQueued();
      await settle(watchA, watchB);
      for (const [label, watcher] of [['A', watchA], ['B', watchB]]) {
        await waitFor(`${label}にメモとカテゴリ`, async () => watcher.items.get('i1')?.data, (data) =>
          data?.note === 'Aのメモ' && data?.category === 'Bのカテゴリ'
        );
      }

      // 同じフィールド: 先にAを届け、そのあとBを届ける(後着=B)。
      await settle(watchA, watchB);
      await Promise.all([disableNetwork(a.db), disableNetwork(b.db)]);
      const writeA = updateDoc(itemRef(a, listId, 'i1'), touch({ name: 'A後勝ちでない名前' }));
      queue(writeA);
      queue(updateDoc(itemRef(b, listId, 'i1'), touch({ name: 'B後勝ちの名前' })));
      await enableNetwork(a.db);
      await writeA; // Aの書込がサーバーに受理されてから、Bを復帰させる(Bが後着になる)
      await enableNetwork(b.db);
      await flushQueued();
      await settle(watchA, watchB);
      for (const [label, watcher] of [['A', watchA], ['B', watchB]]) {
        await waitFor(`${label}がBの値へ収束`, async () => watcher.items.get('i1')?.data.name, (name) => name === 'B後勝ちの名前');
      }
    });

    await step('削除と編集が競合したら削除が優先される(編集しても一覧へ戻らない)', async () => {
      await Promise.all([disableNetwork(a.db), disableNetwork(b.db)]);
      queue(updateDoc(itemRef(a, listId, 'i1'), touch({ deletedAt: serverTimestamp() })));
      queue(updateDoc(itemRef(b, listId, 'i1'), touch({ note: 'Bの遅れた編集' })));
      await Promise.all([enableNetwork(a.db), enableNetwork(b.db)]);
      await flushQueued();
      await settle(watchA, watchB);
      for (const [label, watcher] of [['A', watchA], ['B', watchB]]) {
        const data = await waitFor(`${label}で削除済み`, async () => watcher.items.get('i1')?.data, (d) => d?.deletedAt != null);
        assert(data.deletedAt !== null, `${label}: 削除が残る`);
      }
    });
  } finally {
    watchers.forEach((watcher) => watcher.unsubscribe());
    watchA.unsubscribe();
    watchB.unsubscribe();
  }
}

// Node版のgRPCがネットワークの切替で壊れ、以降の受信が止まることがある(`RESOURCE_EXHAUSTED: Received
// message larger than max`。以前のe2eでも出た通信の乱れで、アプリの不具合ではない)。失敗がこの乱れによるものと
// 分かるときだけ、新しいクライアントで全体をやり直す。アサーションの失敗は再試行しない。
// 乱れは1試行あたり約1/3の確率で出るため、4回まで試す(全て乱れる確率は約1%)。
const MAX_ATTEMPTS = 4;
let transportGlitch = false;
onLog((log) => {
  if (/RESOURCE_EXHAUSTED|Received message larger than max/.test(log.message ?? '')) {
    transportGlitch = true;
  }
});

function isTransportFailure(error) {
  if (transportGlitch) {
    return true;
  }
  return error?.code === 'unavailable' && /offline/i.test(error?.message ?? '');
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
      queued.length = 0;
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
