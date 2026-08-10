import { describe, expect, it } from "bun:test";
import {
  normaliseEmail,
  validateEmail,
  validatePassword,
  sessionExpiry,
  sessionIsLive,
  displayName,
  SESSION_TTL_MS,
} from "../src/lib/auth";

describe("normaliseEmail", () => {
  it("lowercases and trims so one person is one account", () => {
    expect(normaliseEmail("  Sarah.Jenkins@Acme.COM ")).toBe("sarah.jenkins@acme.com");
  });

  it("leaves an already-clean address alone", () => {
    expect(normaliseEmail("a@b.co")).toBe("a@b.co");
  });
});

describe("validateEmail", () => {
  it("accepts ordinary addresses", () => {
    for (const e of ["a@b.co", "sarah.jenkins@acme.com", "x+tag@sub.example.org"]) {
      expect(validateEmail(e)).toBe("ok");
    }
  });

  it("rejects an empty address", () => {
    expect(validateEmail("   ")).toBe("missing");
  });

  it("rejects addresses without a domain dot", () => {
    expect(validateEmail("sarah@localhost")).toBe("malformed");
  });

  it("rejects addresses missing an @", () => {
    expect(validateEmail("sarah.acme.com")).toBe("malformed");
  });

  it("rejects internal whitespace", () => {
    expect(validateEmail("sar ah@acme.com")).toBe("malformed");
  });

  it("rejects absurdly long addresses", () => {
    expect(validateEmail(`${"a".repeat(250)}@acme.com`)).toBe("too_long");
  });

  it("normalises before validating", () => {
    expect(validateEmail("  SARAH@ACME.COM  ")).toBe("ok");
  });
});

describe("validatePassword", () => {
  it("accepts a reasonable password", () => {
    expect(validatePassword("correct-horse-battery")).toBe("ok");
  });

  it("requires at least 8 characters", () => {
    expect(validatePassword("short7!")).toBe("too_short");
  });

  it("accepts exactly 8 characters", () => {
    expect(validatePassword("eightchr")).toBe("ok");
  });

  it("rejects an empty password", () => {
    expect(validatePassword("")).toBe("missing");
  });

  it("rejects common passwords outright", () => {
    expect(validatePassword("password")).toBe("too_common");
    expect(validatePassword("PASSWORD1")).toBe("too_common");
  });

  /* bcrypt-family hashes truncate past 72 bytes; rejecting is honest, silently
     ignoring the tail is not. */
  it("rejects passwords past the 72-byte hashing limit", () => {
    expect(validatePassword("a".repeat(73))).toBe("too_long");
  });

  it("counts bytes, not characters, at the limit", () => {
    // Each emoji is 4 bytes, so 20 of them exceed 72 bytes in 20 characters.
    expect(validatePassword("🔐".repeat(20))).toBe("too_long");
  });

  it("accepts exactly 72 bytes", () => {
    expect(validatePassword("a".repeat(72))).toBe("ok");
  });
});

describe("sessions", () => {
  const NOW = 1_700_000_000_000;

  it("expires 30 days out", () => {
    expect(sessionExpiry(NOW) - NOW).toBe(SESSION_TTL_MS);
  });

  it("counts a fresh session as live", () => {
    expect(sessionIsLive(sessionExpiry(NOW), NOW)).toBe(true);
  });

  it("counts a lapsed session as dead", () => {
    expect(sessionIsLive(NOW - 1, NOW)).toBe(false);
  });

  it("treats the expiry instant itself as dead", () => {
    expect(sessionIsLive(NOW, NOW)).toBe(false);
  });

  it("is live one millisecond before expiry", () => {
    expect(sessionIsLive(NOW + 1, NOW)).toBe(true);
  });
});

describe("displayName", () => {
  it("prefers the stored name", () => {
    expect(displayName("Sarah Jenkins", "s@acme.com")).toBe("Sarah Jenkins");
  });

  it("falls back to a capitalised local part", () => {
    expect(displayName(null, "sarah@acme.com")).toBe("Sarah");
  });

  it("treats a whitespace-only name as absent", () => {
    expect(displayName("   ", "marcus@acme.com")).toBe("Marcus");
  });
});
