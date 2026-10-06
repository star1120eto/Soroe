import { beforeEach, describe, expect, it, vi } from "vitest";

import { leaveListHandler } from "./leaveList";
import * as memberManagement from "./memberManagement";

vi.mock("./memberManagement");

describe("leaveListHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves the list", async () => {
    vi.mocked(memberManagement.leaveListTransaction).mockResolvedValue("ok");

    await expect(leaveListHandler({ listId: "list-1" }, "uid-1")).resolves.toEqual({ ok: true });
    expect(memberManagement.leaveListTransaction).toHaveBeenCalledWith("uid-1", "list-1");
  });

  it("refuses the owner with failed-precondition, telling them to transfer ownership first", async () => {
    vi.mocked(memberManagement.leaveListTransaction).mockResolvedValue("owner-cannot-leave");

    await expect(leaveListHandler({ listId: "list-1" }, "uid-1")).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringContaining("所有権"),
    });
  });

  it("rejects an empty listId before touching Firestore", async () => {
    await expect(leaveListHandler({ listId: "" }, "uid-1")).rejects.toThrow();
    expect(memberManagement.leaveListTransaction).not.toHaveBeenCalled();
  });
});
