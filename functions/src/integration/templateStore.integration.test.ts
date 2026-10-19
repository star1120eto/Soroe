import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createListFromTemplateTransaction, saveMyTemplateTransaction } from "../templates/templateStore";
import { clearEmulator, connectEmulator } from "./emulator";

// TMPL-003 / TMPL-004: マイテンプレートの保存と、テンプレートからのリスト作成のサーバー側の検証。
const PROJECT_ID = "soroe-it-template-store";
const UID = "uid-1";
const LIST_ID = "list-1";

let db: Firestore;

beforeAll(() => {
  db = connectEmulator(PROJECT_ID);
});

beforeEach(async () => {
  await clearEmulator(PROJECT_ID);
});

const now = () => Timestamp.now();

async function seedList({ deleted = false, member = true }: { deleted?: boolean; member?: boolean } = {}) {
  await db.doc(`lists/${LIST_ID}`).set({
    name: "週末のキャンプ",
    type: "packing",
    color: "accent",
    icon: "suitcase",
    ownerId: UID,
    createdBy: UID,
    createdAt: now(),
    updatedAt: now(),
    archivedAt: null,
    deletedAt: deleted ? now() : null,
  });
  if (member) {
    await db.doc(`lists/${LIST_ID}/members/${UID}`).set({ role: "owner", joinedAt: now(), displayName: "たろう" });
  }
  const base = { quantity: null, unit: null, category: null, note: null, createdBy: "someone-else", createdAt: now(), updatedAt: now() };
  await db.doc(`lists/${LIST_ID}/items/i1`).set({
    ...base, name: "テント", quantity: 1, unit: "張", category: "設営", note: "大きい方",
    assigneeId: "member-x", completedAt: null, completedBy: null, sortOrder: 1000, deletedAt: null,
  });
  await db.doc(`lists/${LIST_ID}/items/i2`).set({
    ...base, name: "寝袋", assigneeId: null, completedAt: now(), completedBy: "member-y", sortOrder: 2000, deletedAt: null,
  });
  await db.doc(`lists/${LIST_ID}/items/i3`).set({
    ...base, name: "消した項目", assigneeId: null, completedAt: null, completedBy: null, sortOrder: 3000, deletedAt: now(),
  });
}

async function seedPremium() {
  await db.doc(`entitlements/${UID}`).set({ plan: "premium" });
}

const myTemplates = async () => (await db.collection(`users/${UID}/myTemplates`).get()).docs;

describe("saveMyTemplateTransaction (MYTM-02)", () => {
  const fields = { title: "キャンプの持ち物", description: "家族用" };

  it("saves the live items with their checked state, and none of the sharing or history fields", async () => {
    await seedList();

    const result = await saveMyTemplateTransaction(UID, "req-1", LIST_ID, fields, "free");

    expect(result.status).toBe("saved");
    const [saved] = await myTemplates();
    const data = saved.data();
    expect(data).toMatchObject({ title: "キャンプの持ち物", description: "家族用", listType: "packing", icon: "suitcase", color: "accent", itemCount: 2 });
    expect(data.items.map((item: { name: string }) => item.name)).toEqual(["テント", "寝袋"]);
    expect(data.items.map((item: { checked: boolean }) => item.checked)).toEqual([false, true]);
    for (const item of data.items) {
      expect(Object.keys(item).sort()).toEqual(["category", "checked", "id", "name", "note", "quantity", "unit"]);
    }
    expect(JSON.stringify(data)).not.toMatch(/member-x|member-y|someone-else|assigneeId|completedBy|createdBy/);
  });

  it("rejects a second template for a Free user, but allows it for Premium", async () => {
    await seedList();
    await saveMyTemplateTransaction(UID, "req-1", LIST_ID, fields, "free");

    await expect(saveMyTemplateTransaction(UID, "req-2", LIST_ID, fields, "free")).resolves.toEqual({ status: "limit-reached" });
    expect(await myTemplates()).toHaveLength(1);

    await seedPremium();
    await expect(saveMyTemplateTransaction(UID, "req-3", LIST_ID, fields, "premium")).resolves.toMatchObject({ status: "saved" });
    expect(await myTemplates()).toHaveLength(2);
  });

  it("returns the first result for a retried requestId without saving twice", async () => {
    await seedList();
    const first = await saveMyTemplateTransaction(UID, "req-1", LIST_ID, fields, "free");
    const again = await saveMyTemplateTransaction(UID, "req-1", LIST_ID, fields, "free");

    expect(again).toEqual({ status: "reused", templateId: (first as { templateId: string }).templateId });
    expect(await myTemplates()).toHaveLength(1);
  });

  it("refuses a list with no items", async () => {
    await seedList();
    await db.doc(`lists/${LIST_ID}/items/i1`).update({ deletedAt: now() });
    await db.doc(`lists/${LIST_ID}/items/i2`).update({ deletedAt: now() });

    await expect(saveMyTemplateTransaction(UID, "req-1", LIST_ID, fields, "free")).resolves.toEqual({ status: "empty" });
    expect(await myTemplates()).toHaveLength(0);
  });

  it("treats a non-member, a deleted list and a missing list as not found", async () => {
    await seedList({ member: false });
    await expect(saveMyTemplateTransaction(UID, "req-1", LIST_ID, fields, "free")).resolves.toEqual({ status: "not-found" });

    await clearEmulator(PROJECT_ID);
    await seedList({ deleted: true });
    await expect(saveMyTemplateTransaction(UID, "req-2", LIST_ID, fields, "free")).resolves.toEqual({ status: "not-found" });
    await expect(saveMyTemplateTransaction(UID, "req-3", "missing", fields, "free")).resolves.toEqual({ status: "not-found" });
  });

  it("stays independent of the source list afterwards", async () => {
    await seedList();
    await saveMyTemplateTransaction(UID, "req-1", LIST_ID, fields, "free");

    await db.doc(`lists/${LIST_ID}/items/i1`).update({ name: "変更したテント" });
    await db.doc(`lists/${LIST_ID}/items/i2`).update({ deletedAt: now() });
    await db.doc(`lists/${LIST_ID}`).update({ name: "別の名前" });

    const [saved] = await myTemplates();
    expect(saved.data().items.map((item: { name: string }) => item.name)).toEqual(["テント", "寝袋"]);
    expect(saved.data().itemCount).toBe(2);
  });
});

async function seedOfficial({ published = true }: { published?: boolean } = {}) {
  await db.doc("officialTemplates/day-hike").set({
    category: "outdoor", priority: 10, published, listType: "packing", icon: "suitcase",
    adjustableByPeople: true, defaultPartySize: 2, hasSafetyNotice: true, itemCount: 3,
    ja: { title: "日帰り登山", description: "説明", notice: "注意" },
    en: { title: "Day hike", description: "Description", notice: "Notice" },
  });
  const items: [string, number | null, boolean, string, string][] = [
    ["water", 1, true, "水", "Water"],
    ["map", null, true, "地図", "Map"],
    ["snack", 3, false, "おやつ", "Snacks"],
  ];
  for (const [index, [id, quantity, perPerson, ja, en]] of items.entries()) {
    await db.doc(`officialTemplates/day-hike/items/${id}`).set({
      sortOrder: (index + 1) * 1000, quantity, perPerson,
      ja: { name: ja, unit: null, category: "飲食", note: null },
      en: { name: en, unit: null, category: "Food", note: null },
    });
  }
}

const listsOf = async () => (await db.collection("lists").get()).docs;
const itemsOf = async (listId: string) =>
  (await db.collection(`lists/${listId}/items`).orderBy("sortOrder", "asc").get()).docs.map((d) => d.data());

const official = (overrides: Record<string, unknown> = {}) => ({
  source: "official" as const,
  templateId: "day-hike",
  itemIds: ["water", "map", "snack"],
  partySize: undefined as number | undefined,
  language: "ja" as const,
  ...overrides,
});

describe("createListFromTemplateTransaction: official templates (TMPL-002)", () => {
  it("creates a list from only the selected items, named in the chosen language", async () => {
    await seedOfficial();

    const result = await createListFromTemplateTransaction(UID, "req-1", official({ itemIds: ["water", "snack"], language: "en" }), "free", "たろう");

    expect(result.status).toBe("created");
    const [list] = await listsOf();
    expect(list.data()).toMatchObject({ name: "Day hike", type: "packing", icon: "suitcase", ownerId: UID });
    expect((await itemsOf(list.id)).map((item) => item.name)).toEqual(["Water", "Snacks"]);
    expect((await db.doc(`lists/${list.id}/members/${UID}`).get()).data()).toMatchObject({ role: "owner", displayName: "たろう" });
    expect((await db.doc(`users/${UID}/listRefs/${list.id}`).get()).data()).toMatchObject({ totalCount: 2, completedCount: 0, role: "owner" });
  });

  it("scales only per-person quantities by the party size and leaves unset quantities unset", async () => {
    await seedOfficial();

    await createListFromTemplateTransaction(UID, "req-1", official({ partySize: 4 }), "free", null);

    const [list] = await listsOf();
    const items = await itemsOf(list.id);
    expect(items.map((item) => item.quantity)).toEqual([4, null, 3]);
  });

  it("falls back to the default party size when none is given", async () => {
    await seedOfficial();

    await createListFromTemplateTransaction(UID, "req-1", official(), "free", null);

    const [list] = await listsOf();
    expect((await itemsOf(list.id))[0].quantity).toBe(2);
  });

  it("creates every item as not completed and with the creator as the author", async () => {
    await seedOfficial();

    await createListFromTemplateTransaction(UID, "req-1", official(), "free", null);

    const [list] = await listsOf();
    for (const item of await itemsOf(list.id)) {
      expect(item).toMatchObject({ completedAt: null, completedBy: null, assigneeId: null, createdBy: UID, deletedAt: null });
    }
  });

  it("refuses an unpublished official template", async () => {
    await seedOfficial({ published: false });

    await expect(createListFromTemplateTransaction(UID, "req-1", official(), "free", null)).resolves.toEqual({ status: "not-found" });
    expect(await listsOf()).toHaveLength(0);
  });

  it("refuses ids that are not items of the template and creates nothing", async () => {
    await seedOfficial();

    await expect(
      createListFromTemplateTransaction(UID, "req-1", official({ itemIds: ["water", "nope"] }), "free", null)
    ).resolves.toEqual({ status: "invalid-items" });
    expect(await listsOf()).toHaveLength(0);
    expect((await db.doc(`users/${UID}/createFromTemplateRequests/req-1`).get()).exists).toBe(false);
  });

  it("applies the Free list limit, but not for Premium", async () => {
    await seedOfficial();
    for (const id of ["a", "b", "c"]) {
      await db.doc(`users/${UID}/listRefs/${id}`).set({ name: id, archivedAt: null, deletedAt: null });
    }

    await expect(createListFromTemplateTransaction(UID, "req-1", official(), "free", null)).resolves.toEqual({ status: "limit-reached" });
    expect(await listsOf()).toHaveLength(0);

    await expect(createListFromTemplateTransaction(UID, "req-2", official(), "premium", null)).resolves.toMatchObject({ status: "created" });
  });

  it("returns the first list for a retried requestId without creating another", async () => {
    await seedOfficial();
    const first = await createListFromTemplateTransaction(UID, "req-1", official(), "free", null);
    const again = await createListFromTemplateTransaction(UID, "req-1", official(), "free", null);

    expect(again).toEqual({ status: "reused", listId: (first as { listId: string }).listId });
    expect(await listsOf()).toHaveLength(1);
  });

  it("does not change the created list when the official template changes afterwards", async () => {
    await seedOfficial();
    await createListFromTemplateTransaction(UID, "req-1", official(), "free", null);
    await db.doc("officialTemplates/day-hike/items/water").update({ "ja.name": "変更後の水" });
    await db.doc("officialTemplates/day-hike").update({ "ja.title": "変更後のタイトル" });

    const [list] = await listsOf();
    expect(list.data().name).toBe("日帰り登山");
    expect((await itemsOf(list.id))[0].name).toBe("水");
  });
});

describe("createListFromTemplateTransaction: my templates", () => {
  const item = (id: string, name: string, checked = false) => ({
    id, name, quantity: null, unit: null, category: null, note: null, checked,
  });

  async function seedMyTemplate(owner = UID, items = [item("a", "テント"), item("b", "寝袋", true)]) {
    await db.doc(`users/${owner}/myTemplates/t1`).set({
      title: "キャンプ", description: null, listType: "packing", icon: "suitcase", color: "accent",
      itemCount: items.length, items, createdAt: now(), updatedAt: now(),
    });
  }

  const mine = (overrides: Record<string, unknown> = {}) => ({
    source: "my" as const, templateId: "t1", itemIds: ["a", "b"], partySize: undefined, language: "ja" as const, ...overrides,
  });

  it("creates the list with the saved color and icon, and checked items already completed", async () => {
    await seedMyTemplate();

    await createListFromTemplateTransaction(UID, "req-1", mine(), "free", "たろう");

    const [list] = await listsOf();
    expect(list.data()).toMatchObject({ name: "キャンプ", type: "packing", color: "accent", icon: "suitcase" });
    const items = await itemsOf(list.id);
    expect(items.map((i) => i.name)).toEqual(["テント", "寝袋"]);
    expect(items[0].completedAt).toBeNull();
    expect(items[1]).toMatchObject({ completedBy: UID });
    expect(items[1].completedAt).not.toBeNull();
    expect((await db.doc(`users/${UID}/listRefs/${list.id}`).get()).data()).toMatchObject({ totalCount: 2, completedCount: 1 });
  });

  it("does not use another user's template", async () => {
    await seedMyTemplate("someone-else");

    await expect(createListFromTemplateTransaction(UID, "req-1", mine(), "free", null)).resolves.toEqual({ status: "not-found" });
    expect(await listsOf()).toHaveLength(0);
  });

  it("creates more than 400 items across batches", async () => {
    const many = Array.from({ length: 450 }, (_, index) => item(`i${index}`, `項目${index}`));
    await seedMyTemplate(UID, many);

    const result = await createListFromTemplateTransaction(UID, "req-1", mine({ itemIds: many.map((m) => m.id) }), "free", null);

    expect(result.status).toBe("created");
    const [list] = await listsOf();
    expect((await db.collection(`lists/${list.id}/items`).get()).size).toBe(450);
  });
});
