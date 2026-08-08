import { describe, expect, it } from "vitest";

import {
  archiveListRequestSchema,
  createListInputSchema,
  createListItemInputSchema,
  createListRequestSchema,
  createListResponseSchema,
  deleteListRequestSchema,
  duplicateListRequestSchema,
  duplicateListResponseSchema,
  listItemSchema,
  listSchema,
  okResponseSchema,
  restoreListRequestSchema,
  unarchiveListRequestSchema,
  userListRefSchema,
} from "./list";

const baseList = {
  id: "list-1",
  name: "今週の買い物",
  type: "shopping" as const,
  color: "primary",
  icon: "ph:shopping-cart-simple",
  ownerId: "uid-1",
  createdBy: "uid-1",
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
  deletedAt: null,
};

describe("listSchema", () => {
  it("accepts a valid list", () => {
    expect(() => listSchema.parse(baseList)).not.toThrow();
  });

  it("trims the name", () => {
    expect(listSchema.parse({ ...baseList, name: "  買い物  " }).name).toBe("買い物");
  });

  it.each([
    ["empty name", { name: "" }],
    ["name over 60 chars", { name: "あ".repeat(61) }],
    ["unknown type", { type: "unknown" }],
    ["empty ownerId", { ownerId: "" }],
  ])("rejects %s", (_label, override) => {
    expect(() => listSchema.parse({ ...baseList, ...override })).toThrow();
  });

  it("allows archivedAt and deletedAt to be null or a timestamp", () => {
    expect(() => listSchema.parse({ ...baseList, archivedAt: 100, deletedAt: 200 })).not.toThrow();
  });
});

const baseItem = {
  id: "item-1",
  listId: "list-1",
  name: "トマト",
  quantity: 3,
  unit: "個",
  category: null,
  note: null,
  assigneeId: null,
  dueAt: null,
  completedAt: null,
  completedBy: null,
  sortOrder: 1000,
  createdBy: "uid-1",
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
};

describe("listItemSchema", () => {
  it("accepts a valid item", () => {
    expect(() => listItemSchema.parse(baseItem)).not.toThrow();
  });

  it("allows a negative sortOrder so items can be inserted before the first one", () => {
    expect(() => listItemSchema.parse({ ...baseItem, sortOrder: -500 })).not.toThrow();
  });

  it.each([
    ["empty name", { name: "" }],
    ["name over 100 chars", { name: "あ".repeat(101) }],
    ["note over 500 chars", { note: "あ".repeat(501) }],
    ["zero quantity", { quantity: 0 }],
    ["negative quantity", { quantity: -1 }],
  ])("rejects %s", (_label, override) => {
    expect(() => listItemSchema.parse({ ...baseItem, ...override })).toThrow();
  });
});

describe("userListRefSchema", () => {
  it("accepts zero counts for a new list", () => {
    expect(() =>
      userListRefSchema.parse({
        listId: "list-1",
        name: "今週の買い物",
        type: "shopping",
        color: "primary",
        icon: "ph:shopping-cart-simple",
        role: "owner",
        totalCount: 0,
        completedCount: 0,
        memberCount: 1,
        updatedAt: 1,
        archivedAt: null,
        deletedAt: null,
      })
    ).not.toThrow();
  });
});

describe("input schemas", () => {
  it("createListInputSchema only accepts client-provided fields", () => {
    const parsed = createListInputSchema.parse({
      name: "今週の買い物",
      type: "shopping",
      color: "primary",
      icon: "ph:shopping-cart-simple",
      // サーバーが決める値をクライアントから渡しても取り込まない
      ownerId: "spoofed",
      createdAt: 999,
    });
    expect(parsed).not.toHaveProperty("ownerId");
    expect(parsed).not.toHaveProperty("createdAt");
  });

  it("createListItemInputSchema requires only the name", () => {
    expect(() => createListItemInputSchema.parse({ name: "トマト" })).not.toThrow();
  });
});

describe("createListRequestSchema", () => {
  it("requires a non-empty requestId alongside the list fields", () => {
    const parsed = createListRequestSchema.parse({
      name: "今週の買い物",
      type: "shopping",
      color: "primary",
      icon: "shopping-cart-simple",
      requestId: "req-1",
    });
    expect(parsed.requestId).toBe("req-1");
    expect(parsed.name).toBe("今週の買い物");
  });

  it("rejects an empty requestId", () => {
    expect(() =>
      createListRequestSchema.parse({
        name: "今週の買い物",
        type: "shopping",
        color: "primary",
        icon: "shopping-cart-simple",
        requestId: "",
      })
    ).toThrow();
  });
});

describe("createListResponseSchema", () => {
  it("accepts a listId", () => {
    expect(() => createListResponseSchema.parse({ listId: "list-1" })).not.toThrow();
  });

  it("rejects an empty listId", () => {
    expect(() => createListResponseSchema.parse({ listId: "" })).toThrow();
  });
});

describe("LIST-006 request schemas", () => {
  it("archiveListRequestSchema and deleteListRequestSchema require only a listId", () => {
    expect(() => archiveListRequestSchema.parse({ listId: "list-1" })).not.toThrow();
    expect(() => deleteListRequestSchema.parse({ listId: "list-1" })).not.toThrow();
    expect(() => archiveListRequestSchema.parse({ listId: "" })).toThrow();
  });

  it.each([unarchiveListRequestSchema, restoreListRequestSchema, duplicateListRequestSchema])(
    "requires both listId and requestId",
    (schema) => {
      expect(() => schema.parse({ listId: "list-1", requestId: "req-1" })).not.toThrow();
      expect(() => schema.parse({ listId: "list-1" })).toThrow();
      expect(() => schema.parse({ listId: "list-1", requestId: "" })).toThrow();
    }
  );

  it("duplicateListResponseSchema accepts a listId", () => {
    expect(() => duplicateListResponseSchema.parse({ listId: "list-2" })).not.toThrow();
  });

  it("okResponseSchema only accepts ok: true", () => {
    expect(() => okResponseSchema.parse({ ok: true })).not.toThrow();
    expect(() => okResponseSchema.parse({ ok: false })).toThrow();
  });
});
