// SHARE-005 / AC-01「コア共有体験」の通し確認(Firebase Emulator上の2ユーザー)。
//
// 実機2台での確認はApple Developer Program未登録(ENV-002)のため行えない。代わりに
// 実際のFirebase Client SDK(アプリが使うRules・Callable Functions・リアルタイム購読と
// 同じ経路)を2ユーザー分起動し、「作成→招待→受諾→追加→完了→権限喪失」を通す。
//
// 使い方(リポジトリルートで。Functionsをビルドしておく):
//   pnpm run build:shared && pnpm run build:functions
//   firebase emulators:exec --only auth,firestore,functions \
//     'pnpm --filter mobile run e2e:share'
//
// Emulator以外には接続しない(環境変数が無ければ即座に終了する)。

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  getFirestore,
  onSnapshot,
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

function createClient(name, { signedIn = true } = {}) {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT_ID, authDomain: 'localhost' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, fnHost, Number(fnPort));
  const call = async (functionName, data) => (await httpsCallable(functions, functionName)(data)).data;
  return { app, auth, db, call, signedIn };
}

async function signUp(client, displayName) {
  const email = `${displayName}-${randomUUID()}@example.test`;
  const password = 'test-password-123';
  const credential = await createUserWithEmailAndPassword(client.auth, email, password);
  const uid = credential.user.uid;
  await setDoc(doc(client.db, 'users', uid), { displayName, language: 'ja', createdAt: serverTimestamp() });
  return { uid, email, password };
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

async function expectCallableError(promise, code, description) {
  try {
    await promise;
  } catch (error) {
    const actual = error?.code ?? '';
    assert(actual.endsWith(code), `${description}: expected ${code}, got ${actual}`);
    return;
  }
  throw new Error(`${description}: expected ${code} but the call succeeded`);
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

async function main() {
  const a = createClient('user-a');
  const b = createClient('user-b');
  const c = createClient('user-c');
  const anonymous = createClient('anonymous', { signedIn: false });

  console.log('AC-01 コア共有体験(Emulator・2ユーザー)');
  const { uid: uidA } = await signUp(a, 'たろう');
  const accountB = await signUp(b, 'はなこ');
  const uidB = accountB.uid;
  const { uid: uidC } = await signUp(c, 'じろう');
  console.log(`  A=${uidA}  B=${uidB}`);

  let listId;
  let token; // Bに渡すリンク
  let tokenForC; // Cに渡す別のリンク(リンクは1回のみ有効で、人ごとに発行する)
  let inviteId;
  const seenByA = new Map(); // itemId -> データ。Aの購読が受け取った状態
  let unsubscribeA = () => {};
  const bErrors = [];
  const itemNamesSeenByB = new Set();
  let unsubscribeBItems = () => {};
  let unsubscribeBMembers = () => {};

  try {
    await step('A がリストを作成できる(createList)', async () => {
      const response = await a.call('createList', {
        name: '週末のキャンプ',
        type: 'packing',
        color: 'primary',
        icon: 'suitcase',
        requestId: randomUUID(),
      });
      listId = response.listId;
      assert(typeof listId === 'string' && listId.length > 0, 'listId が返る');
      const member = await getDoc(doc(a.db, 'lists', listId, 'members', uidA));
      assert(member.data()?.role === 'owner', 'A が owner');
      assert(member.data()?.displayName === 'たろう', 'owner の表示名が member に保存される');
    });

    await step('A が項目を追加でき、Aの購読に反映される', async () => {
      unsubscribeA = onSnapshot(
        query(collection(a.db, 'lists', listId, 'items'), where('deletedAt', '==', null)),
        (snapshot) => {
          seenByA.clear();
          snapshot.docs.forEach((d) => seenByA.set(d.id, d.data()));
        }
      );
      await setDoc(doc(collection(a.db, 'lists', listId, 'items')), newItem('テント', uidA, 1000));
      await waitFor('A の購読に「テント」', async () => [...seenByA.values()], (items) => items.some((i) => i.name === 'テント'));
    });

    await step('A が招待リンクを発行できる(トークンはハッシュで保存)。人ごとに別のリンクを発行でき、先のリンクは取り消されない', async () => {
      token = randomBytes(32).toString('hex');
      const response = await a.call('createInvite', { listId, token });
      inviteId = response.inviteId;
      assert(inviteId === createHash('sha256').update(token).digest('hex'), 'inviteId はトークンの SHA-256');
      const remaining = response.expiresAt - Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      assert(remaining > sevenDays - 60_000 && remaining <= sevenDays, '有効期限は約7日');
      const stored = await getDoc(doc(a.db, 'invites', inviteId));
      assert(!JSON.stringify(stored.data()).includes(token), '平文トークンは保存されない');

      tokenForC = randomBytes(32).toString('hex');
      await a.call('createInvite', { listId, token: tokenForC });
      const own = await getDocs(query(collection(a.db, 'invites'), where('listId', '==', listId), where('status', '==', 'active')));
      assert(own.size === 2, 'オーナーは自分のリストの有効な招待(2本)を読める。2本目の発行で1本目は取り消されない');
    });

    await step('未認証でもプレビューが見られる(リスト名・招待者名・メンバー数のみ)', async () => {
      const preview = await anonymous.call('getInvitePreview', { token });
      assert(preview.status === 'valid', 'valid');
      assert(preview.listName === '週末のキャンプ', 'リスト名');
      assert(preview.inviterName === 'たろう', '招待者名');
      assert(preview.memberCount === 1, 'メンバー数');
      assert(!('items' in preview), '項目内容は含まれない');
    });

    await step('B は受諾前はリストを読めない(非メンバーのRules)', async () => {
      let denied = false;
      try {
        await getDoc(doc(b.db, 'lists', listId));
      } catch (error) {
        denied = error?.code === 'permission-denied';
      }
      assert(denied, '非メンバーの読取は permission-denied');
      let inviteDenied = false;
      try {
        await getDoc(doc(b.db, 'invites', inviteId));
      } catch (error) {
        inviteDenied = error?.code === 'permission-denied';
      }
      assert(inviteDenied, '非オーナーは招待を読めない');
    });

    let joinedListId;
    await step('B が招待を受諾して編集者として参加できる(acceptInvite)', async () => {
      const response = await b.call('acceptInvite', { token, requestId: randomUUID() });
      assert(response.status === 'joined', `joined (got ${response.status})`);
      joinedListId = response.listId;
      assert(joinedListId === listId, '同じリストに参加');
      const member = await getDoc(doc(b.db, 'lists', listId, 'members', uidB));
      assert(member.data()?.role === 'editor', 'B は editor');
      assert(member.data()?.displayName === 'はなこ', 'B の表示名が member に保存される');
      const listRef = await getDoc(doc(b.db, 'users', uidB, 'listRefs', listId));
      assert(listRef.exists() && listRef.data().role === 'editor', 'B の一覧参照が作られる');
    });

    await step('使われたリンクは失効し(1回のみ有効)、別の人向けのリンクは有効のまま', async () => {
      const active = await getDocs(query(collection(a.db, 'invites'), where('listId', '==', listId), where('status', '==', 'active')));
      assert(active.size === 1, '有効な招待は C 向けの1本だけ');
      const used = await getDoc(doc(a.db, 'invites', inviteId));
      assert(used.data().status === 'accepted' && used.data().acceptedBy === uidB, 'B が使ったリンクは accepted');
    });

    await step('A・B 双方の一覧参照の memberCount が 2 になる', async () => {
      await waitFor('A の memberCount', async () => (await getDoc(doc(a.db, 'users', uidA, 'listRefs', listId))).data(), (d) => d?.memberCount === 2);
      await waitFor('B の memberCount', async () => (await getDoc(doc(b.db, 'users', uidB, 'listRefs', listId))).data(), (d) => d?.memberCount === 2);
    });

    await step('同じ受諾を再送しても二重に参加しない(冪等)', async () => {
      const again = await b.call('acceptInvite', { token, requestId: randomUUID() });
      assert(again.status === 'already-member', `already-member (got ${again.status})`);
      const members = await getDocs(collection(a.db, 'lists', listId, 'members'));
      assert(members.size === 2, 'メンバーは2人のまま');
    });

    await step('B が項目を追加すると A にリアルタイム反映される', async () => {
      // B 自身も購読を張る(権限喪失の確認で使う)。
      unsubscribeBItems = onSnapshot(
        collection(b.db, 'lists', listId, 'items'),
        (snapshot) => snapshot.docs.forEach((d) => itemNamesSeenByB.add(d.data().name)),
        (error) => bErrors.push({ source: 'items', code: error?.code })
      );
      unsubscribeBMembers = onSnapshot(
        collection(b.db, 'lists', listId, 'members'),
        () => {},
        (error) => bErrors.push({ source: 'members', code: error?.code })
      );
      await setDoc(doc(collection(b.db, 'lists', listId, 'items')), newItem('寝袋', uidB, 2000));
      await waitFor('A の購読に「寝袋」', async () => [...seenByA.values()], (items) => items.some((i) => i.name === '寝袋'));
    });

    await step('B が A の項目を完了にすると A に反映され、一覧の進捗が更新される', async () => {
      const tentId = [...seenByA.entries()].find(([, item]) => item.name === 'テント')[0];
      await updateDoc(doc(b.db, 'lists', listId, 'items', tentId), {
        completedAt: serverTimestamp(),
        completedBy: uidB,
        updatedAt: serverTimestamp(),
      });
      await waitFor(
        'A の購読で「テント」が完了',
        async () => seenByA.get(tentId),
        (item) => item?.completedBy === uidB
      );
      // syncListItemCounts(Firestore trigger)が全メンバーの listRefs を更新する。
      const refA = await waitFor(
        'A の listRef.completedCount',
        async () => (await getDoc(doc(a.db, 'users', uidA, 'listRefs', listId))).data(),
        (d) => d?.totalCount === 2 && d?.completedCount === 1
      );
      assert(refA.totalCount === 2 && refA.completedCount === 1, '1/2 完了');
    });

    await step('編集者 B はオーナー専用の操作ができない(招待作成・メンバー削除・移譲)', async () => {
      await expectCallableError(b.call('createInvite', { listId, token: randomBytes(32).toString('hex') }), 'permission-denied', 'B の招待作成');
      await expectCallableError(b.call('removeMember', { listId, memberUid: uidA }), 'permission-denied', 'B のメンバー削除');
      await expectCallableError(b.call('transferOwnership', { listId, newOwnerUid: uidB }), 'permission-denied', 'B の所有権移譲');
    });

    await step('オーナー A は退出できない(最後のownerを守る)', async () => {
      await expectCallableError(a.call('leaveList', { listId }), 'failed-precondition', 'A の退出');
    });

    await step('A が B を削除すると、B は即座に権限を失う', async () => {
      await a.call('removeMember', { listId, memberUid: uidB });

      // 新しい読取は即座に拒否される。Bの既存の購読は同じクエリのターゲットを共有し
      // SDKがサーバーへ再問い合わせしないことがあるため、購読を持たない別の端末
      // (同じBでサインインし直した新しいクライアント)から読む。
      const freshB = createClient('user-b-fresh');
      await signInWithEmailAndPassword(freshB.auth, accountB.email, accountB.password);
      for (const [label, read] of [
        ['リスト', () => getDocFromServer(doc(freshB.db, 'lists', listId))],
        ['項目', () => getDocsFromServer(collection(freshB.db, 'lists', listId, 'items'))],
        ['メンバー', () => getDocsFromServer(collection(freshB.db, 'lists', listId, 'members'))],
      ]) {
        let denied = false;
        try {
          await read();
        } catch (error) {
          denied = error?.code === 'permission-denied';
        }
        assert(denied, `削除後の B は ${label} を読めない`);
      }
      let writeDenied = false;
      try {
        await setDoc(doc(collection(freshB.db, 'lists', listId, 'items')), newItem('もう追加できない', uidB, 3000));
      } catch (error) {
        writeDenied = error?.code === 'permission-denied';
      }
      assert(writeDenied, '削除後の B は項目を追加できない');

      const refB = await getDocFromServer(doc(freshB.db, 'users', uidB, 'listRefs', listId));
      assert(!refB.exists(), 'B の一覧参照は削除される');
      const refA = await getDoc(doc(a.db, 'users', uidA, 'listRefs', listId));
      assert(refA.data().memberCount === 1, 'A の memberCount は 1 に戻る');
    });

    await step('削除された B は、使用済みの同じリンクでは再参加できない(メンバーと招待リンクは別々に扱う)', async () => {
      const again = await b.call('acceptInvite', { token, requestId: randomUUID() });
      assert(again.status === 'used', `used (got ${again.status})`);
      let denied = false;
      try {
        await getDocFromServer(doc(b.db, 'lists', listId));
      } catch (error) {
        denied = error?.code === 'permission-denied';
      }
      assert(denied, '再参加できていない(読めない)');
    });

    await step('購読中だった B の端末は、メンバー一覧の購読で権限喪失を検知できる', async () => {
      // 実Firestoreでは購読中のリスナーはサーバーが次の更新を配信する際にRulesを再評価し
      // permission-deniedで終了する。メンバー一覧は削除そのものが変更になるため最初に届く。
      await waitFor('B の購読エラー', async () => bErrors, (errors) => errors.some((e) => e.code === 'permission-denied'), 8000);
      console.log(`      B の購読エラー: ${bErrors.map((e) => `${e.source}=${e.code}`).join(', ')}`);
    });

    await step('削除後にAが追加した項目のデータは、購読中だったBへ届かない', async () => {
      // 購読中のリスナーは、サーバーが次の更新を配信する際にRulesを再評価して終了する。
      await setDoc(doc(collection(a.db, 'lists', listId, 'items')), newItem('削除後にAが追加', uidA, 4000));
      await waitFor(
        'B の項目購読の終了',
        async () => bErrors,
        (errors) => errors.some((e) => e.source === 'items' && e.code === 'permission-denied'),
        8000
      );
      assert(!itemNamesSeenByB.has('削除後にAが追加'), '削除後の項目名が B に配信されていない');
      console.log(`      B の購読エラー: ${bErrors.map((e) => `${e.source}=${e.code}`).join(', ')}`);
    });

    await step('別の相手 C は、C 向けに発行したリンクで参加できる', async () => {
      const response = await c.call('acceptInvite', { token: tokenForC, requestId: randomUUID() });
      assert(response.status === 'joined', `joined (got ${response.status})`);
      const member = await getDoc(doc(c.db, 'lists', listId, 'members', uidC));
      assert(member.data()?.displayName === 'じろう', 'C の表示名が member に保存される');
      await waitFor('A の memberCount', async () => (await getDoc(doc(a.db, 'users', uidA, 'listRefs', listId))).data(), (d) => d?.memberCount === 2);
      // B 向けのリンクは C にも使えない。
      const reuse = await c.call('acceptInvite', { token, requestId: randomUUID() });
      assert(reuse.status === 'used', `B 向けのリンクは used (got ${reuse.status})`);
    });

    await step('A の購読は B の削除後も影響を受けず、項目を見続けられる', async () => {
      await waitFor('A の購読に削除後の項目', async () => [...seenByA.values()], (items) => items.some((i) => i.name === '削除後にAが追加'));
      assert(seenByA.size === 3, 'A は3件の項目を購読している');
    });
  } finally {
    unsubscribeA();
    unsubscribeBItems();
    unsubscribeBMembers();
  }
}

main()
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
