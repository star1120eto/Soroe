import { describe, expect, it } from "vitest";

import {
  createListFromTemplateRequestSchema,
  officialTemplateFileSchema,
  scaleQuantity,
} from "./template";

const text = { title: "日帰り登山", description: "低山の日帰り登山の持ち物", notice: null };
const itemText = { name: "水", unit: "L", category: "飲食", note: null };

function validFile() {
  return {
    id: "day-hike",
    category: "outdoor",
    priority: 10,
    published: true,
    listType: "packing",
    icon: "mountains",
    adjustableByPeople: true,
    defaultPartySize: 2,
    hasSafetyNotice: true,
    itemCount: 2,
    ja: { ...text, notice: "安全を保証するものではありません" },
    en: { title: "Day hike", description: "Things to bring", notice: "This is not a safety guarantee" },
    items: [
      { id: "water", sortOrder: 1000, quantity: 1, perPerson: true, ja: itemText, en: { ...itemText, name: "Water" } },
      { id: "map", sortOrder: 2000, quantity: null, perPerson: false, ja: { ...itemText, name: "地図" }, en: { ...itemText, name: "Map" } },
    ],
  };
}

describe("officialTemplateFileSchema", () => {
  it("accepts a valid template file", () => {
    expect(officialTemplateFileSchema.safeParse(validFile()).success).toBe(true);
  });

  it("rejects an unknown category", () => {
    expect(officialTemplateFileSchema.safeParse({ ...validFile(), category: "travel" }).success).toBe(false);
  });

  it("rejects an itemCount that does not match the items", () => {
    expect(officialTemplateFileSchema.safeParse({ ...validFile(), itemCount: 5 }).success).toBe(false);
  });

  it("requires a safety notice in both languages when hasSafetyNotice is true", () => {
    const file = validFile();
    file.ja.notice = null as never;
    expect(officialTemplateFileSchema.safeParse(file).success).toBe(false);
  });

  it("requires at least one per-person item when adjustableByPeople is true", () => {
    const file = validFile();
    file.items[0].perPerson = false;
    expect(officialTemplateFileSchema.safeParse(file).success).toBe(false);
  });

  it("rejects duplicate item ids", () => {
    const file = validFile();
    file.items[1].id = "water";
    expect(officialTemplateFileSchema.safeParse(file).success).toBe(false);
  });
});

describe("scaleQuantity", () => {
  it("multiplies a per-person quantity by the party size", () => {
    expect(scaleQuantity({ quantity: 2, perPerson: true }, 4)).toBe(8);
  });

  it("keeps a quantity that is not per person", () => {
    expect(scaleQuantity({ quantity: 2, perPerson: false }, 4)).toBe(2);
  });

  it("does not leak floating-point noise into the scaled quantity", () => {
    expect(scaleQuantity({ quantity: 0.1, perPerson: true }, 3)).toBe(0.3);
    expect(scaleQuantity({ quantity: 0.7, perPerson: true }, 3)).toBe(2.1);
  });

  it("keeps an unset quantity unset", () => {
    expect(scaleQuantity({ quantity: null, perPerson: true }, 4)).toBeNull();
  });
});

describe("createListFromTemplateRequestSchema", () => {
  const base = { source: "official", templateId: "day-hike", itemIds: ["water"], language: "ja", requestId: "r1" };

  it("accepts a party size from 1 to 10", () => {
    expect(createListFromTemplateRequestSchema.safeParse({ ...base, partySize: 1 }).success).toBe(true);
    expect(createListFromTemplateRequestSchema.safeParse({ ...base, partySize: 10 }).success).toBe(true);
  });

  it("rejects a party size outside 1 to 10", () => {
    expect(createListFromTemplateRequestSchema.safeParse({ ...base, partySize: 0 }).success).toBe(false);
    expect(createListFromTemplateRequestSchema.safeParse({ ...base, partySize: 11 }).success).toBe(false);
  });
});
