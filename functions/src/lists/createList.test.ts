import { beforeEach, describe, expect, it, vi } from "vitest";

import { createListHandler } from "./createList";
import * as entitlements from "./entitlements";
import * as listStore from "./listStore";

vi.mock("./entitlements");
vi.mock("./listStore");

const VALID_INPUT = {
  name: "今週の買い物",
  type: "shopping" as const,
  color: "primary",
  icon: "shopping-cart-simple",
  requestId: "req-1",
};

describe("createListHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entitlements.getPlan).mockResolvedValue("free");
  });

  it("creates a list and returns its id", async () => {
    vi.mocked(listStore.createListTransaction).mockResolvedValue({
      status: "created",
      listId: "list-1",
    });

    const result = await createListHandler(VALID_INPUT, "uid-1");

    expect(result).toEqual({ listId: "list-1" });
    expect(listStore.createListTransaction).toHaveBeenCalledWith(
      "uid-1",
      "req-1",
      { name: "今週の買い物", type: "shopping", color: "primary", icon: "shopping-cart-simple" },
      "free"
    );
  });

  it("returns the original listId on an idempotent replay", async () => {
    vi.mocked(listStore.createListTransaction).mockResolvedValue({
      status: "reused",
      listId: "list-1",
    });

    const result = await createListHandler(VALID_INPUT, "uid-1");

    expect(result).toEqual({ listId: "list-1" });
  });

  it("throws resource-exhausted when the free limit is reached", async () => {
    vi.mocked(listStore.createListTransaction).mockResolvedValue({ status: "limit-reached" });

    await expect(createListHandler(VALID_INPUT, "uid-1")).rejects.toMatchObject({
      code: "resource-exhausted",
    });
  });

  it("passes the caller's plan through to the transaction", async () => {
    vi.mocked(entitlements.getPlan).mockResolvedValue("premium");
    vi.mocked(listStore.createListTransaction).mockResolvedValue({
      status: "created",
      listId: "list-1",
    });

    await createListHandler(VALID_INPUT, "uid-1");

    expect(listStore.createListTransaction).toHaveBeenCalledWith(
      "uid-1",
      "req-1",
      expect.anything(),
      "premium"
    );
  });

  it("rejects an invalid name before touching Firestore", async () => {
    await expect(createListHandler({ ...VALID_INPUT, name: "" }, "uid-1")).rejects.toThrow();
    expect(listStore.createListTransaction).not.toHaveBeenCalled();
  });
});
