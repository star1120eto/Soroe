import { describe, expect, it } from "vitest";

import { pingHandler } from "./index";

describe("pingHandler", () => {
  it("returns ok", () => {
    expect(pingHandler()).toEqual({ ok: true });
  });
});
