import { describe, expect, it } from "vitest";

import { INVITE_EXPIRY_MS, MAX_ACTIVE_INVITES_PER_LIST, classifyInvite, computeInviteExpiry } from "./inviteStatus";

const NOW = Date.UTC(2026, 9, 7, 0, 0, 0);
const activeInvite = {
  listId: "list-1",
  inviterId: "owner",
  status: "active" as const,
  acceptedBy: null,
  expiresAtMs: NOW + 1000,
};
const activeList = { archivedAt: null, deletedAt: null };

describe("computeInviteExpiry", () => {
  it("expires exactly 7 days after creation", () => {
    expect(INVITE_EXPIRY_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(computeInviteExpiry(NOW)).toBe(NOW + 7 * 24 * 60 * 60 * 1000);
  });
});

describe("MAX_ACTIVE_INVITES_PER_LIST", () => {
  it("caps outstanding single-use links so a list cannot accumulate unbounded invites", () => {
    expect(MAX_ACTIVE_INVITES_PER_LIST).toBe(10);
  });
});

describe("classifyInvite", () => {
  it("returns null for an active, unexpired invite to an active list", () => {
    expect(classifyInvite(activeInvite, activeList, NOW)).toBeNull();
  });

  it("is not-found when the invite does not exist", () => {
    expect(classifyInvite(undefined, activeList, NOW)).toBe("not-found");
  });

  it("is revoked for a revoked invite", () => {
    expect(classifyInvite({ ...activeInvite, status: "revoked" }, activeList, NOW)).toBe("revoked");
  });

  it("is expired once the expiry time has passed, including the exact boundary", () => {
    expect(classifyInvite({ ...activeInvite, expiresAtMs: NOW - 1 }, activeList, NOW)).toBe("expired");
    expect(classifyInvite({ ...activeInvite, expiresAtMs: NOW }, activeList, NOW)).toBe("expired");
  });

  it("is used once someone has joined with the link (links are single-use)", () => {
    expect(classifyInvite({ ...activeInvite, status: "accepted", acceptedBy: "uid-2" }, activeList, NOW)).toBe("used");
  });

  it("reports used even after the link would also have expired", () => {
    expect(
      classifyInvite({ ...activeInvite, status: "accepted", acceptedBy: "uid-2", expiresAtMs: NOW - 1 }, activeList, NOW)
    ).toBe("used");
  });

  it("prefers revoked over expired", () => {
    expect(
      classifyInvite({ ...activeInvite, status: "revoked", expiresAtMs: NOW - 1 }, activeList, NOW)
    ).toBe("revoked");
  });

  it("is list-deleted when the list is deleted or no longer exists", () => {
    expect(classifyInvite(activeInvite, { archivedAt: new Date(), deletedAt: new Date() }, NOW)).toBe(
      "list-deleted"
    );
    expect(classifyInvite(activeInvite, undefined, NOW)).toBe("list-deleted");
  });

  it("is list-archived when the list is archived but not deleted", () => {
    expect(classifyInvite(activeInvite, { archivedAt: new Date(), deletedAt: null }, NOW)).toBe(
      "list-archived"
    );
  });
});
