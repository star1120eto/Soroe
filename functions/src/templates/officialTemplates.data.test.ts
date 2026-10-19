import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { officialTemplateFileSchema } from "@soroe/shared";
import { describe, expect, it } from "vitest";

const DATA_DIR = path.resolve(__dirname, "../../data/official-templates");
const files = readdirSync(DATA_DIR).filter((name) => name.endsWith(".json"));
const templates = files.map((name) => ({ name, json: JSON.parse(readFileSync(path.join(DATA_DIR, name), "utf8")) }));

describe("official template data (TMPL-001)", () => {
  it("ships the 10 initial templates", () => {
    expect(files).toHaveLength(10);
  });

  it.each(templates)("$name passes the shared schema", ({ json }) => {
    const result = officialTemplateFileSchema.safeParse(json);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("uses unique ids and names each file after its id", () => {
    const ids = templates.map(({ json }) => json.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { name, json } of templates) {
      expect(name).toBe(`${json.id}.json`);
    }
  });

  it("marks the safety-related templates with a notice", () => {
    const byId = Object.fromEntries(templates.map(({ json }) => [json.id, json]));
    expect(byId["day-hike"].hasSafetyNotice).toBe(true);
    expect(byId["disaster-kit"].hasSafetyNotice).toBe(true);
  });

  it("covers every initial category", () => {
    const categories = new Set(templates.map(({ json }) => json.category));
    expect([...categories].sort()).toEqual(["family-trip", "home", "outdoor", "outing", "school", "shopping"]);
  });

  it("gives every item a Japanese and an English name", () => {
    for (const { json } of templates) {
      for (const item of json.items) {
        expect(item.ja.name.length).toBeGreaterThan(0);
        expect(item.en.name.length).toBeGreaterThan(0);
      }
    }
  });
});
