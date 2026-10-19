# LIST-003 リスト詳細 + SHARE-001 メンバー基盤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/soroe-implementation-backlog.md` の LIST-003(リスト詳細の購読・高速追加・チェック・未完了/完了表示)と SHARE-001(members・ユーザー側一覧参照の原子的・冪等なメンバー追加)を実装する。あわせて、両チケットが依存する既存の欠落 — `lists/{listId}/items` への書込みが `users/{uid}/listRefs` の `totalCount`/`completedCount` に一切反映されない — を埋める新規Firestore triggerを追加する。

**Architecture:** リスト詳細画面は LIST-001 で既に実装済みの `subscribeToList`/`subscribeToListItems`/`addListItem`/`setListItemCompletion` をそのまま使う純粋なUI画面であり、新規のCallable FunctionsやRules変更を伴わない。項目数の集計は新規Firestore trigger `syncListItemCounts`(`lists/{listId}/items/{itemId}` の書込みを監視)が担う。SHARE-001は「招待受諾(SHARE-002、未着手)から呼ばれる内部プリミティブ」として `addMemberTransaction` を実装する — `createList`(Callable)が `listStore.ts::createListTransaction`(内部transaction)を土台にしているのと同じ構造で、`members`作成 + `listRefs`作成を1つのFirestore transactionで原子的に行う。まだ招待を検証するCallable(SHARE-002)が無いため、この関数を直接呼び出せるクライアント経路は今回作らない(Rulesは既にLIST-001で「オーナーでも直接メンバーを追加できない」を保証済み)。

**Tech Stack:** Firebase Cloud Functions v2 (Firestore trigger)、Firestore Admin SDK transaction、Expo Router、React Native、Vitest(functions)。

## Global Constraints

- リスト詳細画面はLIST-001が既に作った `subscribeToList`/`subscribeToListItems`/`addListItem`/`updateListItem`/`setListItemCompletion`/`reorderListItem`/`softDeleteListItem`(`apps/mobile/src/features/lists/ListRepository.ts`)を**そのまま**使う。新しいRepository関数は追加しない。
- 未完了を上、完了済みを下に表示する(`docs/soroe-functional-specification.md` LIST-04)。
- 高速追加はEnterまたはボタンで保存し、入力欄をクリアするが画面遷移・フォーカス喪失はしない(「入力欄を維持する」)。
- 項目名の抽出補助(数量・単位の自動抽出)・同名警告・フィルター・手動並べ替えUIはLIST-005の範囲であり、このチケットでは実装しない。項目編集フォーム(数量・カテゴリ・メモ等のフル編集)はLIST-004の範囲であり、このチケットでは実装しない。リストの複製・アーカイブ・削除・共有メニューはLIST-006/SHARE-002〜004の範囲であり、このチケットでは実装しない。
- `syncListItemCounts` トリガーは項目の物理削除ができない(論理削除のみ)という既存のRules制約を前提にする。`deletedAt == null` の項目だけを数える。
- `addMemberTransaction` はCallable Functionとして公開しない(SHARE-002が招待検証後に呼び出す内部関数)。冪等性は「既にメンバーか」で判定する(requestIdは使わない — クライアント向けCallableの冪等性はSHARE-002がその時点で設計する)。
- Firestoreのtransactionは全readをwriteより前に行う必要がある(`functions/src/lists/listStore.ts`と同じ制約)。
- functions側のFirestore直叩きモジュール(store層)はこのリポジトリの既存慣習として単体テスト対象外(`functions/src/emailOtp/otpStore.ts`、`functions/src/lists/listStore.ts`が前例)。オーケストレーション層やFirestore triggerのハンドラ部分はFirestoreをmock/fakeしてテストする(`functions/src/lists/syncListRef.ts`とそのテストが前例)。
- モバイル側のroute component(`app/`配下)はこのリポジトリの既存慣習として単体テスト対象外。検証はEmulator + 実機/Web previewでの手動確認で行う。
- デザインシステムの新規コンポーネントは追加しない。`ListRow`/`Checkbox`/`Input`/`Button`/`Skeleton`/`ErrorState`(`apps/mobile/src/design-system`)を使う。

---

## Task 1: functions — 項目数集計トリガーの純粋ロジック

**Files:**
- Create: `functions/src/lists/syncListItemCounts.ts`
- Test: `functions/src/lists/syncListItemCounts.test.ts`

**Interfaces:**
- Produces: `computeItemCounts(items: { completedAt: unknown }[]): { totalCount: number; completedCount: number }`(純粋関数、単体テスト対象)。`syncListItemCountsHandler(db: Pick<Firestore, "collection" | "batch">, listId: string): Promise<void>`(Firestoreをfakeしてテストする)。`syncListItemCounts`(`onDocumentWritten`でexportされるCloud Function、Task 2で`index.ts`からexport)。

**背景**: `lists/{listId}/items` はclient writeで直接作成・更新される(LIST-001のRules)。しかし `users/{uid}/listRefs/{listId}` の `totalCount`/`completedCount` はどこからも更新されていない — `createList`(LIST-002)は新規リスト作成時に `0`/`0` を書くだけで、その後項目が追加・完了されても反映されない。このtriggerが項目の書込みを監視し、`deletedAt == null` の項目を数え直して全メンバーの `listRefs` へ伝播する。件数はFirestoreの `count()` 集計クエリではなく通常の `get()` で全件取得しJS側で数える(家族向けリストの実利用規模では十分軽量であり、`completedAt != null` の複合インデックスを新規に用意する必要がないため)。

- [ ] **Step 1: 失敗するテストを書く**

`functions/src/lists/syncListItemCounts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { computeItemCounts, syncListItemCountsHandler } from "./syncListItemCounts";

describe("computeItemCounts", () => {
  it("returns zero for no items", () => {
    expect(computeItemCounts([])).toEqual({ totalCount: 0, completedCount: 0 });
  });

  it("counts total and completed separately", () => {
    const items = [{ completedAt: null }, { completedAt: "2026-01-01" }, { completedAt: null }];
    expect(computeItemCounts(items)).toEqual({ totalCount: 3, completedCount: 1 });
  });

  it("treats every non-null completedAt as completed", () => {
    const items = [{ completedAt: "a" }, { completedAt: "b" }];
    expect(computeItemCounts(items)).toEqual({ totalCount: 2, completedCount: 2 });
  });
});

function fakeDb(itemDocs: { completedAt: unknown }[], memberUids: string[]) {
  const itemsGet = vi.fn().mockResolvedValue({ docs: itemDocs.map((data) => ({ data: () => data })) });
  const membersGet = vi.fn().mockResolvedValue({
    empty: memberUids.length === 0,
    docs: memberUids.map((uid) => ({ id: uid })),
  });
  const update = vi.fn();
  const commit = vi.fn().mockResolvedValue(undefined);

  const listsCollection = {
    doc: vi.fn(() => ({
      collection: vi.fn((name: string) => {
        if (name === "items") {
          return { where: vi.fn(() => ({ get: itemsGet })) };
        }
        return { get: membersGet };
      }),
    })),
  };

  const usersCollection = {
    doc: vi.fn(() => ({
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ marker: "listRef" })),
      })),
    })),
  };

  const db = {
    collection: vi.fn((name: string) => (name === "lists" ? listsCollection : usersCollection)),
    batch: vi.fn(() => ({ update, commit })),
  };

  return { db, update, commit };
}

describe("syncListItemCountsHandler", () => {
  it("propagates counts to every member's listRef", async () => {
    const { db, update, commit } = fakeDb(
      [{ completedAt: null }, { completedAt: "done" }],
      ["owner-uid", "editor-uid"]
    );

    await syncListItemCountsHandler(db as never, "list-1");

    expect(update).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledOnce();
    const [, patch] = update.mock.calls[0];
    expect(patch).toEqual({ totalCount: 2, completedCount: 1 });
  });

  it("does nothing when the list has no members", async () => {
    const { db, update, commit } = fakeDb([], []);

    await syncListItemCountsHandler(db as never, "list-1");

    expect(update).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm --filter functions exec vitest run src/lists/syncListItemCounts.test.ts`
Expected: FAIL — `Cannot find module './syncListItemCounts'`。

- [ ] **Step 3: 最小実装を書く**

`functions/src/lists/syncListItemCounts.ts`:

```ts
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

// 集計クエリ(count()の != フィルタ)は複合インデックスを新規に要求するため、
// 通常のgetで全件取得しJS側で数える。家族向けリストの規模では十分軽量。
export function computeItemCounts(
  items: { completedAt: unknown }[]
): { totalCount: number; completedCount: number } {
  return {
    totalCount: items.length,
    completedCount: items.filter((item) => item.completedAt !== null).length,
  };
}

export async function syncListItemCountsHandler(
  db: Pick<Firestore, "collection" | "batch">,
  listId: string
): Promise<void> {
  const listRef = db.collection("lists").doc(listId);
  const itemsSnap = await listRef.collection("items").where("deletedAt", "==", null).get();
  const counts = computeItemCounts(itemsSnap.docs.map((doc: { data: () => DocumentData }) => doc.data() as { completedAt: unknown }));

  const membersSnap = await listRef.collection("members").get();
  if (membersSnap.empty) {
    return;
  }

  const batch = db.batch();
  for (const memberDoc of membersSnap.docs) {
    batch.update(
      db.collection("users").doc(memberDoc.id).collection("listRefs").doc(listId),
      counts
    );
  }
  await batch.commit();
}

// items/{itemId}への追加・更新(完了トグル・論理削除含む)すべてで発火する。
// 物理削除は既存Rulesで禁止されているためonDocumentWrittenのdelete分岐は
// 実質発生しない。
export const syncListItemCounts = onDocumentWritten("lists/{listId}/items/{itemId}", async (event) => {
  await syncListItemCountsHandler(getFirestore(), event.params.listId);
});
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm --filter functions exec vitest run src/lists/syncListItemCounts.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/src/lists/syncListItemCounts.ts functions/src/lists/syncListItemCounts.test.ts
git commit -m "LIST-003: 項目数をlistRefsへ集計するFirestore triggerを追加"
```

---

## Task 2: functions — index.tsへの登録

**Files:**
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `syncListItemCounts`(`./lists/syncListItemCounts`、Task 1)。

- [ ] **Step 1: エクスポートを追加する**

`functions/src/index.ts` の末尾に追記:

```ts
export { syncListItemCounts } from "./lists/syncListItemCounts";
```

(既存の `export { createList } ...` / `export { syncListRef } ...` の直後に置く)

- [ ] **Step 2: 全体テスト・ビルドを確認する**

Run: `pnpm run ci`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add functions/src/index.ts
git commit -m "LIST-003: syncListItemCountsをFunctionsエントリポイントへ登録"
```

---

## Task 3: functions — メンバー追加の原子的transaction(SHARE-001)

**Files:**
- Create: `functions/src/lists/memberStore.ts`
- No test(このリポジトリの既存慣習: `listStore.ts`同様、Firestore transactionを直接扱うstore層は単体テスト対象外。Task 6の手動検証でカバーする)。

**Interfaces:**
- Produces: `AddMemberResult = { status: "added" } | { status: "already-member" }`、`addMemberTransaction(listId: string, uid: string, role: ListRole): Promise<AddMemberResult>`。まだこの関数を呼び出すCallable Functionは無い(SHARE-002が将来担う)。

**背景**: `docs/soroe-implementation-backlog.md` SHARE-001「`members` とユーザー側一覧参照を実装し、owner/editorのRulesをEmulatorで網羅する。メンバー追加と一覧参照作成は原子的・冪等に行う。」のうち、`members`スキーマ・`listRefs`スキーマ・Rules・Rulesテスト(owner/editor網羅)は既にLIST-001で完了している(`functions/src/rules/firestore.rules.test.ts`の`describe("lists/{listId}/members", ...)`ブロックを参照)。残る「メンバー追加と一覧参照作成を原子的・冪等に行う」実装がこのタスク。

- [ ] **Step 1: 実装を書く**

`functions/src/lists/memberStore.ts`:

```ts
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { ListRole } from "@soroe/shared";

export type AddMemberResult =
  | { status: "added" }
  | { status: "already-member" };

// 招待受諾(SHARE-002、未着手)から呼ばれる内部関数。冪等性はrequestIdでは
// なく「既にメンバーか」で判定する: 同一ユーザーが同じリストへ二重参加
// しようとしても新しい状態を作らないため、この判定で十分かつシンプル。
// クライアント向けCallableの冪等性(requestId)はSHARE-002が別途設計する。
export async function addMemberTransaction(
  listId: string,
  uid: string,
  role: ListRole
): Promise<AddMemberResult> {
  const db = getFirestore();
  const listRef = db.collection("lists").doc(listId);
  const memberRef = listRef.collection("members").doc(uid);
  const listRefDocRef = db.collection("users").doc(uid).collection("listRefs").doc(listId);

  return db.runTransaction(async (tx) => {
    // Firestoreのtransactionはread-then-writeが必須。読み取りを先に終える。
    const [memberSnap, listSnap, existingMembersSnap] = await Promise.all([
      tx.get(memberRef),
      tx.get(listRef),
      tx.get(listRef.collection("members")),
    ]);

    if (memberSnap.exists) {
      return { status: "already-member" as const };
    }
    if (!listSnap.exists) {
      throw new Error(`list ${listId} not found`);
    }
    const list = listSnap.data()!;
    const newMemberCount = existingMembersSnap.size + 1;

    // 既存メンバー(オーナー)のlistRefから現在の集計値を引き継ぐ。項目数が
    // 変わればsyncListItemCountsトリガーが次回の項目変更で上書きするため、
    // ここでの値は参加直後の初期表示用でよい。
    const ownerListRefSnap = await tx.get(
      db.collection("users").doc(list.ownerId as string).collection("listRefs").doc(listId)
    );
    const ownerListRef = ownerListRefSnap.data() as
      | { totalCount?: number; completedCount?: number }
      | undefined;

    const now = FieldValue.serverTimestamp();

    tx.set(memberRef, { role, joinedAt: now });
    tx.set(listRefDocRef, {
      name: list.name,
      type: list.type,
      color: list.color,
      icon: list.icon,
      role,
      totalCount: ownerListRef?.totalCount ?? 0,
      completedCount: ownerListRef?.completedCount ?? 0,
      memberCount: newMemberCount,
      updatedAt: now,
      archivedAt: list.archivedAt ?? null,
    });
    // 既存メンバー全員のmemberCountも更新する。
    for (const memberDoc of existingMembersSnap.docs) {
      tx.update(
        db.collection("users").doc(memberDoc.id).collection("listRefs").doc(listId),
        { memberCount: newMemberCount }
      );
    }

    return { status: "added" as const };
  });
}
```

- [ ] **Step 2: typecheckを通す**

Run: `pnpm --filter functions run typecheck`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add functions/src/lists/memberStore.ts
git commit -m "SHARE-001: メンバー追加+listRefs作成の原子的transactionを実装"
```

---

## Task 4: mobile — リスト詳細画面 (LIST-04)

**Files:**
- Create: `apps/mobile/src/app/list/[listId].tsx`
- Modify: `apps/mobile/src/app/_layout.tsx`

**Interfaces:**
- Consumes: `subscribeToList`, `subscribeToListItems`, `addListItem`, `setListItemCompletion`(`@/features/lists/ListRepository`、既存)。`ListRow`, `Button`, `Colors`, `ErrorState`, `Input`, `Skeleton`, `Spacing`, `Typography`(`@/design-system`、既存)。`useSession`(`@/features/session/SessionProvider`、既存)。
- Produces: ルート `/list/[listId]`。

**注記**: `subscribeToListItems`が返す`hasPendingWrites`/`isFromCache`はOFF-001(オフラインBanner、未着手)の範囲。このタスクでは使わない。項目タップでの編集フォーム(数量・カテゴリ等)はLIST-004の範囲。フィルター・並べ替え・同名警告はLIST-005の範囲。メニュー(共有・複製・アーカイブ・削除)はSHARE-002〜004/LIST-006の範囲。

- [ ] **Step 1: 実装を書く**

`apps/mobile/src/app/list/[listId].tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { List, ListItem } from '@soroe/shared';

import { Button, Colors, ErrorState, Input, ListRow, Skeleton, Spacing, Typography } from '@/design-system';
import {
  addListItem,
  setListItemCompletion,
  subscribeToList,
  subscribeToListItems,
} from '@/features/lists/ListRepository';
import { useSession } from '@/features/session/SessionProvider';

// LIST-04: リスト詳細。購読・高速追加・チェック/再開・未完了/完了の表示。
export default function ListDetailScreen() {
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId: string }>();
  // (app)グループと同じくstatus==='authenticated'配下でしか到達しないため
  // profileは必ず非null(apps/mobile/src/app/_layout.tsx)。
  const { profile } = useSession();
  const uid = profile!.uid;

  const [list, setList] = useState<List | null>(null);
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    return subscribeToList(listId, setList, () => setError('リストを読み込めませんでした'));
  }, [listId]);

  useEffect(() => {
    return subscribeToListItems(
      listId,
      (snapshot) => setItems(snapshot.items),
      () => setError('項目を読み込めませんでした')
    );
  }, [listId]);

  const addItem = () => {
    const name = draftName.trim();
    if (!name || !items) {
      return;
    }
    // 末尾へ追加。中間挿入は隣接2件の中間値を使う(LIST-005で実装)。
    const nextSortOrder = items.length === 0 ? 1000 : items[items.length - 1].sortOrder + 1000;
    addListItem(listId, uid, { name }, nextSortOrder);
    setDraftName('');
  };

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState title="読み込みに失敗しました" description={error} />
      </SafeAreaView>
    );
  }

  if (list === null || items === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Skeleton width="100%" height={24} />
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
        </View>
      </SafeAreaView>
    );
  }

  const incompleteItems = items.filter((item) => item.completedAt === null);
  const completedItems = items.filter((item) => item.completedAt !== null);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Button label="戻る" onPress={() => router.back()} variant="text" />
          <Text style={[Typography.title, styles.headerTitle]} numberOfLines={1}>
            {list.name}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {items.length === 0 ? (
            <Text style={[Typography.body, styles.emptyText]}>まだ項目がありません</Text>
          ) : null}

          {incompleteItems.length > 0 ? (
            <View style={styles.section}>
              <Text style={[Typography.label, styles.sectionLabel]}>未完了</Text>
              {incompleteItems.map((item) => (
                <ListRow
                  key={item.id}
                  label={item.name}
                  checked={false}
                  onChange={(checked) => setListItemCompletion(listId, item.id, uid, checked)}
                />
              ))}
            </View>
          ) : null}

          {completedItems.length > 0 ? (
            <View style={styles.section}>
              <Text style={[Typography.label, styles.sectionLabel]}>完了</Text>
              {completedItems.map((item) => (
                <ListRow
                  key={item.id}
                  label={item.name}
                  checked={true}
                  onChange={(checked) => setListItemCompletion(listId, item.id, uid, checked)}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.quickAdd}>
          <View style={styles.quickAddInput}>
            <Input
              placeholder="項目を追加"
              value={draftName}
              onChangeText={setDraftName}
              onSubmitEditing={addItem}
              returnKeyType="done"
            />
          </View>
          <Button label="追加" onPress={addItem} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[3],
  },
  headerTitle: {
    flex: 1,
    color: Colors.textPrimary,
  },
  content: {
    padding: Spacing[5],
    gap: Spacing[4],
  },
  emptyText: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    gap: Spacing[3],
  },
  sectionLabel: {
    color: Colors.textSecondary,
  },
  quickAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    padding: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  quickAddInput: {
    flex: 1,
  },
});
```

`apps/mobile/src/app/_layout.tsx` の `<Stack.Screen name="new-list-method" .../>` の直後に追加:

```tsx
      <Stack.Screen name="list/[listId]" />
```

(このスクリーンは `<Stack screenOptions={{ headerShown: false }}>` の既定を継承するため、追加のoptionsは不要)

- [ ] **Step 2: typecheckを通す**

Run: `pnpm --filter mobile run typecheck`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add apps/mobile/src/app/list/[listId].tsx apps/mobile/src/app/_layout.tsx
git commit -m "LIST-003: リスト詳細画面(LIST-04)を実装"
```

---

## Task 5: mobile — 一覧画面からリスト詳細への遷移

**Files:**
- Modify: `apps/mobile/src/app/(app)/index.tsx`

**Interfaces:**
- Consumes: Task 4で追加したルート `/list/[listId]`。

**背景**: `apps/mobile/src/app/(app)/index.tsx`の`TemplateCard`には現在`onPress`が渡されていない(LIST-002時点ではリスト詳細画面が存在しなかったため)。Task 4で詳細画面ができたので配線する。

- [ ] **Step 1: 実装を書く**

`apps/mobile/src/app/(app)/index.tsx` の `<TemplateCard ... />` を次のように変更する(既存の`key`/`icon`/`title`/`subtitle`/`accentColor`propsは変更しない、`onPress`だけ追加):

```tsx
        {lists.map((list) => (
          <TemplateCard
            key={list.listId}
            icon={isPhIconName(list.icon) ? list.icon : 'tray'}
            title={list.name}
            subtitle={summarize(list)}
            accentColor={colorValueForToken(list.color)}
            onPress={() => router.push(`/list/${list.listId}`)}
          />
        ))}
```

- [ ] **Step 2: typecheckを通す**

Run: `pnpm --filter mobile run typecheck`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add "apps/mobile/src/app/(app)/index.tsx"
git commit -m "LIST-003: リスト一覧からリスト詳細への遷移を配線"
```

---

## Task 6: 全体検証(CI + Rules + Firebase Emulator)

**Files:** なし(検証のみ)。

- [ ] **Step 1: CIを通す**

Run: `pnpm run ci`
Expected: PASS

- [ ] **Step 2: Rulesテストを通す**

Run: `pnpm --filter functions run test:rules`(JDKが必要な場合は`export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`を先に実行)
Expected: PASS(既存33件、SHARE-001はRules変更を伴わないため件数は変わらない — LIST-001時点で owner/editor の網羅は既に完了していることをこのタスクで確認・記録する)。

- [ ] **Step 3: Firebase Emulatorを起動する**

Run: `firebase emulators:start --only auth,firestore,functions`(別ターミナルまたはbackground)

- [ ] **Step 4: syncListItemCountsを実Emulatorに対して検証する**

Admin SDKで直接: `lists/{listId}` と最初のメンバー(owner)の `listRefs` をシードし、`lists/{listId}/items/{itemId}` を作成 → `listRefs.totalCount`が1になることを確認 → `completedAt`を設定して更新 → `completedCount`が1になることを確認。

- [ ] **Step 5: addMemberTransactionを実Emulatorに対して検証する**

`functions/src/lists/memberStore.ts`の`addMemberTransaction`を直接importして呼び出すNode script(Admin SDK、`FIRESTORE_EMULATOR_HOST`設定)で: 既存リスト+オーナーのlistRefをシード → 2人目のuidで`addMemberTransaction(listId, uid2, "editor")`を呼ぶ → `lists/{listId}/members/{uid2}`が`role:"editor"`で作成されること、`users/{uid2}/listRefs/{listId}`がオーナーの集計値を引き継いで作成されること、オーナー側の`listRefs.memberCount`が2に更新されることを確認 → 同じ呼び出しをもう一度実行し`{status:"already-member"}`が返り新しい書込みが発生しないことを確認。

- [ ] **Step 6: モバイル画面をWeb previewまたは実機で確認する**

Web previewはFirestore Lite SDKの制約でonSnapshotが使えないため、可能であれば実機/エミュレータで確認する: リスト一覧のカードをタップ → リスト詳細画面が開く → 高速追加で項目が即座に表示される → チェックで完了欄へ移動する → 一覧画面へ戻ると進捗(`◯/◯完了`)が更新されていることを確認する。Web previewしか使えない場合は、この手順を試みた上で結果(成功/環境要因でブロック)を記録する。

- [ ] **Step 7: 記録**

Expected: 全項目を確認できたらこのタスクを完了とする。環境要因で一部確認できない場合はその旨と原因を記録する(LIST-002のTask 14と同様の扱い)。

---

## Self-Review Notes

- **Spec coverage**: LIST-04(リスト詳細の購読・高速追加・チェック・再開・未完了/完了の表示・入力欄維持)→Task 4。集計値の同期(LIST-002時点の既知の欠落)→Task 1〜2。SHARE-001(members・listRefsの原子的・冪等な追加。owner/editorのRules網羅)→Rules/RulesテストはLIST-001で完了済みと確認、追加実装分はTask 3。一覧からの遷移→Task 5。すべてTaskに対応済み。
- **Placeholder scan**: 各Stepに実コードを記載済み。TODO/後で実装は無し。
- **Type consistency**: `syncListItemCountsHandler`のシグネチャ(Task 1)は`syncListRefHandler`(既存)と同じ`Pick<Firestore, "collection" | "batch">`パターン。`addMemberTransaction`の戻り値型`AddMemberResult`(Task 3)は`CreateListResult`(既存`listStore.ts`)と同じ判別可能ユニオンの流儀。Task 4の`ListItem`/`List`型は`@soroe/shared`の既存エクスポートと一致。Task 5の`TemplateCard`への`onPress`追加は既存コンポーネントの既存propであり変更不要(`TemplateCardProps.onPress?: () => void`は元々定義済み)。
