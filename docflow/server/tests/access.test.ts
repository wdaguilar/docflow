import { describe, expect, it } from "bun:test";
import { checkAccess, newToken, newId } from "../src/lib/tokens";

const DAY = 864e5;
const NOW = 1_700_000_000_000;

const doc = (over: Partial<{ status: string; expiresAt: number | null }> = {}) => ({
  status: "awaiting_others",
  expiresAt: null,
  ...over,
});

describe("newToken", () => {
  it("is long enough to resist guessing", () => {
    expect(newToken().length).toBe(24);
  });

  it("stays URL-safe", () => {
    for (let i = 0; i < 200; i++) {
      expect(newToken()).toMatch(/^[0-9A-Za-z]+$/);
    }
  });

  it("omits look-alike characters that break phone transcription", () => {
    const sample = Array.from({ length: 500 }, () => newToken()).join("");
    for (const c of ["I", "l", "O", "o", "U"]) {
      expect(sample).not.toContain(c);
    }
  });

  it("does not collide across many draws", () => {
    const seen = new Set(Array.from({ length: 5000 }, () => newToken()));
    expect(seen.size).toBe(5000);
  });

  it("issues ids of the documented length", () => {
    expect(newId().length).toBe(16);
  });
});

describe("checkAccess", () => {
  it("lets the active signer through", () => {
    expect(checkAccess({ signer: { status: "active" }, document: doc(), now: NOW })).toBe(
      "ok",
    );
  });

  it("turns away an unknown token", () => {
    expect(checkAccess({ signer: null, document: null, now: NOW })).toBe("not_found");
  });

  it("blocks a signer whose turn has not come", () => {
    expect(
      checkAccess({ signer: { status: "pending" }, document: doc(), now: NOW }),
    ).toBe("awaiting_turn");
  });

  it("blocks a second submission from the same signer", () => {
    expect(
      checkAccess({ signer: { status: "signed" }, document: doc(), now: NOW }),
    ).toBe("already_signed");
  });

  it("blocks an expired document", () => {
    expect(
      checkAccess({
        signer: { status: "active" },
        document: doc({ expiresAt: NOW - DAY }),
        now: NOW,
      }),
    ).toBe("expired");
  });

  it("treats the expiry instant itself as expired", () => {
    expect(
      checkAccess({
        signer: { status: "active" },
        document: doc({ expiresAt: NOW }),
        now: NOW,
      }),
    ).toBe("expired");
  });

  it("allows access one millisecond before expiry", () => {
    expect(
      checkAccess({
        signer: { status: "active" },
        document: doc({ expiresAt: NOW + 1 }),
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("puts voiding ahead of every other verdict", () => {
    expect(
      checkAccess({
        signer: { status: "active" },
        document: doc({ status: "voided", expiresAt: NOW - DAY }),
        now: NOW,
      }),
    ).toBe("voided");
  });
});
