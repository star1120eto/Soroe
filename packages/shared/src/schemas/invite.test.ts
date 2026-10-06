import { describe, expect, it } from "vitest";

import {
  acceptInviteRequestSchema,
  acceptInviteResponseSchema,
  createInviteRequestSchema,
  createInviteResponseSchema,
  invitePreviewRequestSchema,
  invitePreviewResponseSchema,
  inviteTokenSchema,
  leaveListRequestSchema,
  removeMemberRequestSchema,
  revokeInviteRequestSchema,
  transferOwnershipRequestSchema,
} from "./invite";

const TOKEN = "a".repeat(64);

describe("inviteTokenSchema", () => {
  it("accepts a 256-bit lowercase hex token", () => {
    expect(() => inviteTokenSchema.parse("0123456789abcdef".repeat(4))).not.toThrow();
  });

  it.each([
    ["too short (128-bit)", "a".repeat(32)],
    ["too long", "a".repeat(65)],
    ["uppercase hex", "A".repeat(64)],
    ["non-hex characters", "g".repeat(64)],
    ["empty", ""],
  ])("rejects %s", (_label, token) => {
    expect(() => inviteTokenSchema.parse(token)).toThrow();
  });
});

describe("createInvite schemas", () => {
  it("requires the list id and a valid token", () => {
    expect(() => createInviteRequestSchema.parse({ listId: "list-1", token: TOKEN })).not.toThrow();
    expect(() => createInviteRequestSchema.parse({ listId: "", token: TOKEN })).toThrow();
    expect(() => createInviteRequestSchema.parse({ listId: "list-1", token: "short" })).toThrow();
  });

  it("returns the invite id and its expiry in epoch milliseconds", () => {
    expect(createInviteResponseSchema.parse({ inviteId: "hash", expiresAt: 1 })).toEqual({
      inviteId: "hash",
      expiresAt: 1,
    });
    expect(() => createInviteResponseSchema.parse({ inviteId: "hash", expiresAt: 0 })).toThrow();
  });
});

describe("invitePreviewResponseSchema", () => {
  it("carries only the list name, inviter name and member count for a valid invite", () => {
    const parsed = invitePreviewResponseSchema.parse({
      status: "valid",
      listName: "今週の買い物",
      inviterName: "たろう",
      memberCount: 2,
      expiresAt: 1,
    });
    expect(parsed).toEqual({
      status: "valid",
      listName: "今週の買い物",
      inviterName: "たろう",
      memberCount: 2,
      expiresAt: 1,
    });
  });

  it("allows an unknown inviter name (profile without a display name)", () => {
    expect(
      invitePreviewResponseSchema.parse({
        status: "valid",
        listName: "今週の買い物",
        inviterName: null,
        memberCount: 1,
        expiresAt: 1,
      }).status
    ).toBe("valid");
  });

  it.each(["expired", "revoked", "used", "list-deleted", "list-archived", "not-found"])(
    "reports %s without leaking any list details",
    (status) => {
      expect(invitePreviewResponseSchema.parse({ status })).toEqual({ status });
    }
  );

  it("rejects an unknown status", () => {
    expect(() => invitePreviewResponseSchema.parse({ status: "whatever" })).toThrow();
  });
});

describe("acceptInvite schemas", () => {
  it("requires a token and a requestId", () => {
    expect(() => acceptInviteRequestSchema.parse({ token: TOKEN, requestId: "req-1" })).not.toThrow();
    expect(() => acceptInviteRequestSchema.parse({ token: TOKEN, requestId: "" })).toThrow();
  });

  it.each(["joined", "already-member"])("returns the list id when %s", (status) => {
    expect(acceptInviteResponseSchema.parse({ status, listId: "list-1" })).toEqual({
      status,
      listId: "list-1",
    });
  });

  it.each(["limit-reached", "own-invite", "expired", "revoked", "used", "list-deleted", "list-archived", "not-found"])(
    "returns %s as a plain status",
    (status) => {
      expect(acceptInviteResponseSchema.parse({ status })).toEqual({ status });
    }
  );

  it("rejects joined without a list id", () => {
    expect(() => acceptInviteResponseSchema.parse({ status: "joined" })).toThrow();
  });
});

describe("member management request schemas", () => {
  it("validates revokeInvite", () => {
    expect(() => revokeInviteRequestSchema.parse({ inviteId: "hash" })).not.toThrow();
    expect(() => revokeInviteRequestSchema.parse({ inviteId: "" })).toThrow();
  });

  it("validates removeMember", () => {
    expect(() => removeMemberRequestSchema.parse({ listId: "list-1", memberUid: "uid-2" })).not.toThrow();
    expect(() => removeMemberRequestSchema.parse({ listId: "list-1", memberUid: "" })).toThrow();
  });

  it("validates leaveList", () => {
    expect(() => leaveListRequestSchema.parse({ listId: "list-1" })).not.toThrow();
    expect(() => leaveListRequestSchema.parse({})).toThrow();
  });

  it("validates transferOwnership", () => {
    expect(() => transferOwnershipRequestSchema.parse({ listId: "list-1", newOwnerUid: "uid-2" })).not.toThrow();
    expect(() => transferOwnershipRequestSchema.parse({ listId: "list-1", newOwnerUid: "" })).toThrow();
  });

  it("validates getInvitePreview", () => {
    expect(() => invitePreviewRequestSchema.parse({ token: TOKEN })).not.toThrow();
    expect(() => invitePreviewRequestSchema.parse({ token: "x" })).toThrow();
  });
});
