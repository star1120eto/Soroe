import { describe, expect, it } from "vitest";

import { hashInviteToken } from "./token";

describe("hashInviteToken", () => {
  it("returns the SHA-256 hex digest of the token", () => {
    // echo -n abc | shasum -a 256
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("is deterministic and differs per token", () => {
    expect(hashInviteToken("a".repeat(64))).toBe(hashInviteToken("a".repeat(64)));
    expect(hashInviteToken("a".repeat(64))).not.toBe(hashInviteToken("b".repeat(64)));
  });

  it("never contains the plaintext token", () => {
    const token = "c".repeat(64);
    expect(hashInviteToken(token)).not.toContain(token);
  });
});
