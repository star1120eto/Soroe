import { beforeEach, describe, expect, it, vi } from "vitest";

import * as entitlements from "../lists/entitlements";
import { saveMyTemplateHandler } from "./saveMyTemplate";
import * as templateStore from "./templateStore";

vi.mock("../lists/entitlements");
vi.mock("./templateStore");

const INPUT = { listId: "list-1", title: "キャンプ", description: null, requestId: "req-1" };

describe("saveMyTemplateHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entitlements.getPlan).mockResolvedValue("free");
  });

  it("returns the saved template's id", async () => {
    vi.mocked(templateStore.saveMyTemplateTransaction).mockResolvedValue({ status: "saved", templateId: "t-1" });

    await expect(saveMyTemplateHandler(INPUT, "uid-1")).resolves.toEqual({ templateId: "t-1" });
    expect(templateStore.saveMyTemplateTransaction).toHaveBeenCalledWith(
      "uid-1", "req-1", "list-1", { title: "キャンプ", description: null }, "free"
    );
  });

  it("returns the first template's id for a retried request", async () => {
    vi.mocked(templateStore.saveMyTemplateTransaction).mockResolvedValue({ status: "reused", templateId: "t-1" });

    await expect(saveMyTemplateHandler(INPUT, "uid-1")).resolves.toEqual({ templateId: "t-1" });
  });

  it.each([
    ["not-found", "not-found"],
    ["empty", "invalid-argument"],
    ["limit-reached", "resource-exhausted"],
  ] as const)("maps %s to the %s error code", async (status, code) => {
    vi.mocked(templateStore.saveMyTemplateTransaction).mockResolvedValue({ status });

    await expect(saveMyTemplateHandler(INPUT, "uid-1")).rejects.toMatchObject({ code });
  });

  it("says the Free limit is one template", async () => {
    vi.mocked(templateStore.saveMyTemplateTransaction).mockResolvedValue({ status: "limit-reached" });

    await expect(saveMyTemplateHandler(INPUT, "uid-1")).rejects.toMatchObject({
      message: "Freeプランで保存できるマイテンプレートは1件までです",
    });
  });

  it("rejects invalid input before touching the store", async () => {
    await expect(saveMyTemplateHandler({ ...INPUT, title: "" }, "uid-1")).rejects.toThrow();
    expect(templateStore.saveMyTemplateTransaction).not.toHaveBeenCalled();
  });
});
