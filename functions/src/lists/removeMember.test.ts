import { beforeEach, describe, expect, it, vi } from "vitest";

import * as memberManagement from "./memberManagement";
import { removeMemberHandler } from "./removeMember";

vi.mock("./memberManagement");

const INPUT = { listId: "list-1", memberUid: "uid-2" };

describe("removeMemberHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes the member", async () => {
    vi.mocked(memberManagement.removeMemberTransaction).mockResolvedValue("ok");

    await expect(removeMemberHandler(INPUT, "uid-1")).resolves.toEqual({ ok: true });
    expect(memberManagement.removeMemberTransaction).toHaveBeenCalledWith("uid-1", "list-1", "uid-2");
  });

  it.each([
    ["not-found", "not-found"],
    ["forbidden", "permission-denied"],
    ["target-not-member", "not-found"],
    ["owner-cannot-leave", "failed-precondition"],
  ] as const)("maps %s to %s", async (result, code) => {
    vi.mocked(memberManagement.removeMemberTransaction).mockResolvedValue(result);

    await expect(removeMemberHandler(INPUT, "uid-1")).rejects.toMatchObject({ code });
  });

  it("rejects an empty member uid before touching Firestore", async () => {
    await expect(removeMemberHandler({ listId: "list-1", memberUid: "" }, "uid-1")).rejects.toThrow();
    expect(memberManagement.removeMemberTransaction).not.toHaveBeenCalled();
  });
});
