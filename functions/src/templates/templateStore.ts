import { FieldValue, getFirestore, type DocumentData, type Firestore } from "firebase-admin/firestore";
import {
  scaleQuantity,
  type CreateListFromTemplateRequest,
  type ListType,
  type MyTemplateItem,
  type TemplateLanguage,
} from "@soroe/shared";

import { FIRESTORE_BATCH_CHUNK_SIZE, FREE_MY_TEMPLATE_LIMIT } from "../lists/constants";
import { isUnderActiveListLimit, type Plan } from "../lists/listLimit";

// TMPL-003: マイテンプレートの保存と、テンプレート(公式・マイ)からのリスト作成。
// 上限と冪等性はtransaction内で判定する。項目の書込だけは、500書込の上限を避けるため
// transactionの外で400件ずつのbatchに分ける(既存のduplicateListと同じ方針)。

export type SaveMyTemplateResult =
  | { status: "saved" | "reused"; templateId: string }
  | { status: "not-found" }
  | { status: "empty" }
  | { status: "limit-reached" };

/**
 * リストの現在の項目(論理削除を除く)を、独立したマイテンプレートとして保存する。
 * 共有メンバー・担当者・作成者・完了者・履歴は保存しない。完了状態は「初期チェック」として残す。
 * 項目のIDは新しく採番し、元のリストの項目とは切り離す。
 */
export async function saveMyTemplateTransaction(
  uid: string,
  requestId: string,
  listId: string,
  fields: { title: string; description: string | null },
  plan: Plan
): Promise<SaveMyTemplateResult> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const requestRef = userRef.collection("saveMyTemplateRequests").doc(requestId);
  const templatesRef = userRef.collection("myTemplates");
  const listRef = db.collection("lists").doc(listId);
  const memberRef = listRef.collection("members").doc(uid);

  return db.runTransaction(async (tx) => {
    // read-then-write。読み取りを先に終える。
    const [requestSnap, listSnap, memberSnap, templatesSnap] = await Promise.all([
      tx.get(requestRef),
      tx.get(listRef),
      tx.get(memberRef),
      tx.get(templatesRef),
    ]);
    if (requestSnap.exists) {
      return { status: "reused" as const, templateId: requestSnap.data()!.templateId as string };
    }
    if (!listSnap.exists || !memberSnap.exists || listSnap.data()!.deletedAt !== null) {
      return { status: "not-found" as const };
    }
    const itemsSnap = await tx.get(listRef.collection("items").where("deletedAt", "==", null).orderBy("sortOrder", "asc"));
    if (itemsSnap.empty) {
      return { status: "empty" as const };
    }
    if (plan !== "premium" && templatesSnap.size >= FREE_MY_TEMPLATE_LIMIT) {
      return { status: "limit-reached" as const };
    }

    const list = listSnap.data()!;
    const items: MyTemplateItem[] = itemsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: db.collection("_ids").doc().id,
        name: data.name,
        quantity: data.quantity ?? null,
        unit: data.unit ?? null,
        category: data.category ?? null,
        note: data.note ?? null,
        checked: data.completedAt != null,
      };
    });

    const templateRef = templatesRef.doc();
    const now = FieldValue.serverTimestamp();
    tx.set(templateRef, {
      title: fields.title,
      description: fields.description,
      listType: list.type,
      icon: list.icon,
      color: list.color,
      itemCount: items.length,
      items,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(requestRef, { templateId: templateRef.id, createdAt: now });
    return { status: "saved" as const, templateId: templateRef.id };
  });
}

export type CreateListFromTemplateResult =
  | { status: "created" | "reused"; listId: string }
  | { status: "not-found" }
  | { status: "invalid-items" }
  | { status: "limit-reached" };

type NewItem = {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  note: string | null;
  checked: boolean;
};

type ResolvedTemplate = { name: string; type: ListType; color: string; icon: string; items: NewItem[] };

function localizedOfficialItem(
  data: DocumentData,
  language: TemplateLanguage,
  partySize: number,
  adjustable: boolean
): NewItem {
  const text = data[language];
  const quantity = adjustable
    ? scaleQuantity({ quantity: data.quantity ?? null, perPerson: data.perPerson === true }, partySize)
    : (data.quantity ?? null);
  return {
    name: text.name,
    quantity,
    unit: text.unit ?? null,
    category: text.category ?? null,
    note: text.note ?? null,
    checked: false,
  };
}

/**
 * 選んだ項目だけでリストを作る。公式は公開済みのみ。選択IDがテンプレートに無ければ何も作らない。
 * リストの上限(Free 3件)を同じtransaction内で判定し、`requestId` の再送は最初の結果を返す。
 */
export async function createListFromTemplateTransaction(
  uid: string,
  requestId: string,
  input: Pick<CreateListFromTemplateRequest, "source" | "templateId" | "itemIds" | "partySize" | "language">,
  plan: Plan,
  displayName: string | null
): Promise<CreateListFromTemplateResult> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const requestRef = userRef.collection("createFromTemplateRequests").doc(requestId);
  const activeListRefsQuery = userRef.collection("listRefs").where("archivedAt", "==", null);
  const selected = new Set(input.itemIds);

  let itemsToCreate: NewItem[] = [];
  let newListId: string | null = null;

  const result = await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (requestSnap.exists) {
      return { status: "reused" as const, listId: requestSnap.data()!.listId as string };
    }

    let resolved: ResolvedTemplate;
    if (input.source === "official") {
      const templateRef = db.collection("officialTemplates").doc(input.templateId);
      const [templateSnap, itemsSnap] = await Promise.all([tx.get(templateRef), tx.get(templateRef.collection("items"))]);
      const template = templateSnap.data();
      if (!templateSnap.exists || template?.published !== true) {
        return { status: "not-found" as const };
      }
      const byId = new Map(itemsSnap.docs.map((doc) => [doc.id, doc.data()]));
      if ([...selected].some((id) => !byId.has(id))) {
        return { status: "invalid-items" as const };
      }
      const partySize = input.partySize ?? (template.defaultPartySize as number);
      const ordered = itemsSnap.docs
        .filter((doc) => selected.has(doc.id))
        .sort((a, b) => (a.data().sortOrder as number) - (b.data().sortOrder as number));
      resolved = {
        name: (template[input.language].title as string).slice(0, 60),
        type: template.listType,
        color: "primary",
        icon: template.icon,
        items: ordered.map((doc) => localizedOfficialItem(doc.data(), input.language, partySize, template.adjustableByPeople === true)),
      };
    } else {
      const templateSnap = await tx.get(userRef.collection("myTemplates").doc(input.templateId));
      if (!templateSnap.exists) {
        return { status: "not-found" as const };
      }
      const template = templateSnap.data()!;
      const templateItems = template.items as MyTemplateItem[];
      const ids = new Set(templateItems.map((item) => item.id));
      if ([...selected].some((id) => !ids.has(id))) {
        return { status: "invalid-items" as const };
      }
      resolved = {
        name: (template.title as string).slice(0, 60),
        type: template.listType,
        color: template.color,
        icon: template.icon,
        items: templateItems.filter((item) => selected.has(item.id)),
      };
    }

    const activeSnap = await tx.get(activeListRefsQuery);
    if (!isUnderActiveListLimit(activeSnap.size, plan)) {
      return { status: "limit-reached" as const };
    }

    const listRef = db.collection("lists").doc();
    const now = FieldValue.serverTimestamp();
    const checkedCount = resolved.items.filter((item) => item.checked).length;
    tx.set(listRef, {
      name: resolved.name,
      type: resolved.type,
      color: resolved.color,
      icon: resolved.icon,
      ownerId: uid,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    });
    tx.set(listRef.collection("members").doc(uid), { role: "owner", joinedAt: now, displayName });
    tx.set(userRef.collection("listRefs").doc(listRef.id), {
      name: resolved.name,
      type: resolved.type,
      color: resolved.color,
      icon: resolved.icon,
      role: "owner",
      totalCount: resolved.items.length,
      completedCount: checkedCount,
      memberCount: 1,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    });
    tx.set(requestRef, { listId: listRef.id, createdAt: now });

    itemsToCreate = resolved.items;
    newListId = listRef.id;
    return { status: "created" as const, listId: listRef.id };
  });

  if (result.status === "created" && newListId) {
    await writeItemsInChunks(db, newListId, uid, itemsToCreate);
  }
  return result;
}

async function writeItemsInChunks(db: Firestore, listId: string, uid: string, items: NewItem[]): Promise<void> {
  const itemsCollection = db.collection("lists").doc(listId).collection("items");
  const now = FieldValue.serverTimestamp();

  for (let offset = 0; offset < items.length; offset += FIRESTORE_BATCH_CHUNK_SIZE) {
    const batch = db.batch();
    items.slice(offset, offset + FIRESTORE_BATCH_CHUNK_SIZE).forEach((item, index) => {
      batch.set(itemsCollection.doc(), {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        note: item.note,
        assigneeId: null,
        dueAt: null,
        completedAt: item.checked ? now : null,
        completedBy: item.checked ? uid : null,
        sortOrder: (offset + index + 1) * 1000,
        createdBy: uid,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    });
    await batch.commit();
  }
}
