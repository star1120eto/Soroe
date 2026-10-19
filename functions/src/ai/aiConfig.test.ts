import { getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAiModel } from "./aiConfig";

vi.mock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));

const mockGet = vi.fn();
const mockDoc = vi.fn().mockReturnValue({ get: mockGet });
const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });

describe("getAiModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFirestore).mockReturnValue({ collection: mockCollection } as unknown as ReturnType<typeof getFirestore>);
  });

  it("falls back to the default model names without a config document", async () => {
    mockGet.mockResolvedValue({ data: () => undefined });
    await expect(getAiModel("free")).resolves.toBe("gpt-5.6-luna");
    await expect(getAiModel("premium")).resolves.toBe("gpt-5.6-terra");
    expect(mockCollection).toHaveBeenCalledWith("config");
    expect(mockDoc).toHaveBeenCalledWith("ai");
  });

  it("uses the configured model names without an app update", async () => {
    mockGet.mockResolvedValue({ data: () => ({ freeModel: "free-x", premiumModel: "premium-y" }) });
    await expect(getAiModel("free")).resolves.toBe("free-x");
    await expect(getAiModel("premium")).resolves.toBe("premium-y");
  });

  it("ignores an empty or non-string override", async () => {
    mockGet.mockResolvedValue({ data: () => ({ freeModel: "", premiumModel: 5 }) });
    await expect(getAiModel("free")).resolves.toBe("gpt-5.6-luna");
    await expect(getAiModel("premium")).resolves.toBe("gpt-5.6-terra");
  });
});
