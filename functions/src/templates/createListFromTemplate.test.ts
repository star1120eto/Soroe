import { beforeEach, describe, expect, it, vi } from "vitest";

import * as entitlements from "../lists/entitlements";
import * as profile from "../users/profile";
import { createListFromTemplateHandler } from "./createListFromTemplate";
import * as templateStore from "./templateStore";

vi.mock("../lists/entitlements");
vi.mock("../users/profile");
vi.mock("./templateStore");

const INPUT = {
  source: "official",
  templateId: "day-hike",
  itemIds: ["water"],
  partySize: 3,
  language: "ja",
  requestId: "req-1",
};

describe("createListFromTemplateHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entitlements.getPlan).mockResolvedValue("free");
    vi.mocked(profile.getDisplayName).mockResolvedValue("たろう");
  });

  it("returns the created list's id", async () => {
    vi.mocked(templateStore.createListFromTemplateTransaction).mockResolvedValue({ status: "created", listId: "list-1" });

    await expect(createListFromTemplateHandler(INPUT, "uid-1")).resolves.toEqual({ listId: "list-1" });
    expect(templateStore.createListFromTemplateTransaction).toHaveBeenCalledWith(
      "uid-1",
      "req-1",
      { source: "official", templateId: "day-hike", itemIds: ["water"], partySize: 3, language: "ja" },
      "free",
      "たろう"
    );
  });

  it.each([
    [{ status: "not-found" }, "not-found", "テンプレートが見つかりません"],
    [{ status: "invalid-items" }, "invalid-argument", "選択した項目がテンプレートにありません"],
    [{ status: "limit-reached" }, "resource-exhausted", "Freeプランで作成できるリストは3件までです"],
  ] as const)("maps %j to %s", async (result, code, message) => {
    vi.mocked(templateStore.createListFromTemplateTransaction).mockResolvedValue(result);

    await expect(createListFromTemplateHandler(INPUT, "uid-1")).rejects.toMatchObject({ code, message });
  });

  it("rejects a party size outside 1 to 10 before touching the store", async () => {
    await expect(createListFromTemplateHandler({ ...INPUT, partySize: 11 }, "uid-1")).rejects.toThrow();
    expect(templateStore.createListFromTemplateTransaction).not.toHaveBeenCalled();
  });
});
