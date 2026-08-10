import { describe, expect, it } from "bun:test";
import {
  validateSigners,
  validateFields,
  resolveExpiry,
  MAX_SIGNERS,
  MAX_EXPIRY_DAYS,
  type RawField,
  type Result,
} from "../src/lib/recipients";

/** Asserts success and narrows to the value, so each test reads as one line. */
function ok<T>(r: Result<T>): T {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.message);
  return r.value;
}

const box = (signerIndex: number, over: Partial<RawField> = {}): RawField => ({
  signerIndex,
  page: 0,
  x: 0.1,
  y: 0.8,
  w: 0.3,
  h: 0.05,
  ...over,
});

describe("validateSigners", () => {
  it("accepts a well-formed list", () => {
    const v = ok(validateSigners([{ name: "Sarah Jenkins", email: "Sarah@Acme.COM " }]));
    expect(v).toEqual([{ name: "Sarah Jenkins", email: "sarah@acme.com" }]);
  });

  it("rejects an empty list", () => {
    const r = validateSigners([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("signers_required");
  });

  it("rejects a missing name", () => {
    const r = validateSigners([{ name: "  ", email: "a@b.co" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("needs a name");
  });

  /* The email is the signer's identity on the certificate page, so garbage
     here is worse than cosmetic. */
  it("rejects a malformed email", () => {
    for (const email of ["asdf", "no-at-sign.com", "sarah@localhost", "a b@c.com"]) {
      const r = validateSigners([{ name: "Sarah", email }]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("signer_email_invalid");
    }
  });

  it("names the offending signer in the message", () => {
    const r = validateSigners([
      { name: "Sarah", email: "sarah@acme.com" },
      { name: "Marcus", email: "nope" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Marcus");
  });

  it("rejects the same person listed twice, ignoring case", () => {
    const r = validateSigners([
      { name: "Sarah", email: "sarah@acme.com" },
      { name: "Sarah J", email: "SARAH@ACME.COM" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("duplicate_signer");
  });

  it("caps the number of signers", () => {
    const many = Array.from({ length: MAX_SIGNERS + 1 }, (_, i) => ({
      name: `Signer ${i}`,
      email: `s${i}@acme.com`,
    }));
    const r = validateSigners(many);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too_many_signers");
  });

  it("allows exactly the maximum", () => {
    const many = Array.from({ length: MAX_SIGNERS }, (_, i) => ({
      name: `Signer ${i}`,
      email: `s${i}@acme.com`,
    }));
    expect(validateSigners(many).ok).toBe(true);
  });
});

describe("validateFields", () => {
  it("accepts one box per signer", () => {
    expect(validateFields([box(0), box(1)], 2, 1).ok).toBe(true);
  });

  it("rejects an empty list", () => {
    const r = validateFields([], 1, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("fields_required");
  });

  /* This is the failure the client's index remap prevents: a box left pointing
     at a signer who is no longer on the document. */
  it("rejects a box pointing past the end of the signer list", () => {
    const r = validateFields([box(0), box(5)], 2, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("field_signer_unknown");
  });

  it("rejects a negative signer index", () => {
    const r = validateFields([box(-1)], 2, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("field_signer_unknown");
  });

  it("rejects a box on a page that doesn't exist", () => {
    const r = validateFields([box(0, { page: 4 })], 1, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("field_page_out_of_range");
  });

  it("rejects a box that runs off the page", () => {
    const r = validateFields([box(0, { x: 0.9, w: 0.4 })], 1, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("field_out_of_bounds");
  });

  it("rejects a zero-area box", () => {
    const r = validateFields([box(0, { h: 0 })], 1, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("field_out_of_bounds");
  });

  /* A signer with no box gets a link to a document they cannot complete —
     the workflow would stall forever. */
  it("rejects a signer who has nowhere to sign", () => {
    const r = validateFields([box(0), box(0)], 2, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("signer_without_field");
  });

  it("allows several boxes for one signer", () => {
    expect(validateFields([box(0), box(0, { y: 0.5 }), box(1)], 2, 1).ok).toBe(true);
  });
});

describe("resolveExpiry", () => {
  const NOW = 1_700_000_000_000;

  it("treats 0 as never", () => {
    expect(ok(resolveExpiry(0, NOW))).toBeNull();
  });

  it("treats undefined as never", () => {
    expect(ok(resolveExpiry(undefined, NOW))).toBeNull();
  });

  it("converts days into a timestamp", () => {
    expect(ok(resolveExpiry(14, NOW))).toBe(NOW + 14 * 864e5);
  });

  /* The browser's min attribute is trivially bypassed, so this is the check
     that stops a document being born already expired. */
  it("rejects a negative expiry", () => {
    const r = resolveExpiry(-5, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("expiry_negative");
  });

  it("rejects a fractional expiry", () => {
    expect(resolveExpiry(1.5, NOW).ok).toBe(false);
  });

  it("rejects a non-number", () => {
    expect(resolveExpiry("30", NOW).ok).toBe(false);
    expect(resolveExpiry(NaN, NOW).ok).toBe(false);
    expect(resolveExpiry(Infinity, NOW).ok).toBe(false);
  });

  it("caps how far out expiry can be set", () => {
    const r = resolveExpiry(MAX_EXPIRY_DAYS + 1, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("expiry_too_far");
  });

  it("allows exactly the maximum", () => {
    expect(resolveExpiry(MAX_EXPIRY_DAYS, NOW).ok).toBe(true);
  });
});
