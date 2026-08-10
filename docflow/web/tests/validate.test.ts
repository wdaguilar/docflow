import { describe, expect, it } from "bun:test";
import { prepareSend, looksLikeEmail, isBlankRow } from "../src/lib/validate";

const S = (name: string, email: string) => ({ name, email });

const box = (signerIndex: number) => ({
  signerIndex,
  page: 0,
  x: 0.1,
  y: 0.8,
  w: 0.3,
  h: 0.05,
});

const value = <T>(r: { ok: boolean } & Record<string, any>): T => {
  expect(r.ok).toBe(true);
  return r.value as T;
};

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(looksLikeEmail("sarah@acme.com")).toBe(true);
    expect(looksLikeEmail("  X+tag@sub.example.org ")).toBe(true);
  });

  it("rejects malformed ones", () => {
    for (const e of ["asdf", "a@b", "no-at.com", "a b@c.com", ""]) {
      expect(looksLikeEmail(e)).toBe(false);
    }
  });
});

describe("isBlankRow", () => {
  it("treats a whitespace-only row as blank", () => {
    expect(isBlankRow(S("  ", " "))).toBe(true);
  });

  it("treats a half-filled row as not blank", () => {
    expect(isBlankRow(S("Sarah", ""))).toBe(false);
  });
});

describe("prepareSend", () => {
  it("passes a well-formed request through", () => {
    const v = value<any>(
      prepareSend([S("Sarah", "sarah@acme.com")], [box(0)], 14),
    );
    expect(v.signers).toEqual([{ name: "Sarah", email: "sarah@acme.com" }]);
    expect(v.fields[0].signerIndex).toBe(0);
  });

  /* The bug this function exists to prevent.
     Blank row at position 0, real signer at position 1. Dropping the blank row
     shifts the real signer to position 0, so a box still pointing at index 1
     would be assigned to nobody — and the signature would silently vanish. */
  it("remaps box positions when a leading blank row is dropped", () => {
    const v = value<any>(
      prepareSend(
        [S("", ""), S("Marcus", "marcus@acme.com")],
        [box(1)],
        14,
      ),
    );
    expect(v.signers).toHaveLength(1);
    expect(v.signers[0].name).toBe("Marcus");
    expect(v.fields[0].signerIndex).toBe(0);
  });

  it("remaps correctly with a blank row in the middle", () => {
    const v = value<any>(
      prepareSend(
        [S("Sarah", "sarah@acme.com"), S("", ""), S("Priya", "priya@acme.com")],
        [box(0), box(2)],
        0,
      ),
    );
    expect(v.signers.map((s: any) => s.name)).toEqual(["Sarah", "Priya"]);
    expect(v.fields.map((f: any) => f.signerIndex).sort()).toEqual([0, 1]);
  });

  it("discards boxes belonging to a dropped row", () => {
    const v = value<any>(
      prepareSend(
        [S("Sarah", "sarah@acme.com"), S("", "")],
        [box(0), box(1)],
        0,
      ),
    );
    expect(v.fields).toHaveLength(1);
    expect(v.fields[0].signerIndex).toBe(0);
  });

  it("keeps every signer covered after remapping", () => {
    const r = prepareSend(
      [S("", ""), S("Sarah", "sarah@acme.com"), S("Marcus", "marcus@acme.com")],
      [box(1)],
      0,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Marcus");
  });

  it("rejects a row with a name but no email", () => {
    const r = prepareSend([S("Sarah", "")], [box(0)], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("email");
  });

  it("rejects a row with an email but no name", () => {
    const r = prepareSend([S("", "sarah@acme.com")], [box(0)], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("name");
  });

  it("rejects a malformed email", () => {
    const r = prepareSend([S("Sarah", "asdf")], [box(0)], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("asdf");
  });

  it("rejects duplicate signers regardless of case", () => {
    const r = prepareSend(
      [S("Sarah", "sarah@acme.com"), S("S J", "SARAH@ACME.COM")],
      [box(0), box(1)],
      0,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("more than once");
  });

  it("rejects an all-blank signer list", () => {
    const r = prepareSend([S("", ""), S("  ", " ")], [], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("at least one signer");
  });

  it("rejects a request with no boxes", () => {
    const r = prepareSend([S("Sarah", "sarah@acme.com")], [], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("signature box");
  });

  it("rejects a negative expiry", () => {
    const r = prepareSend([S("Sarah", "sarah@acme.com")], [box(0)], -3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("whole number");
  });

  it("rejects an expiry beyond the cap", () => {
    const r = prepareSend([S("Sarah", "sarah@acme.com")], [box(0)], 400);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("at most");
  });

  it("accepts 0 as never expires", () => {
    expect(prepareSend([S("Sarah", "sarah@acme.com")], [box(0)], 0).ok).toBe(true);
  });
});
