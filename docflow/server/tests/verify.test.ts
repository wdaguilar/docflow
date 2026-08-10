import { describe, expect, it } from "bun:test";
import { sha256, fingerprint, digestsMatch } from "../src/lib/hash";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("sha256", () => {
  it("matches the known digest for an empty input", async () => {
    expect(await sha256(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is stable across calls", async () => {
    const a = await sha256(bytes("%PDF-1.7 contract"));
    const b = await sha256(bytes("%PDF-1.7 contract"));
    expect(a).toBe(b);
  });

  it("changes when a single byte changes", async () => {
    const a = await sha256(bytes("Agreed: $10,000"));
    const b = await sha256(bytes("Agreed: $90,000"));
    expect(a).not.toBe(b);
  });

  it("always returns 64 hex characters", async () => {
    expect(await sha256(bytes("x"))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("fingerprint", () => {
  it("groups the digest into readable blocks", async () => {
    const fp = fingerprint(await sha256(new Uint8Array()));
    expect(fp).toBe("E3B0 C442 98FC 1C14 9AFB F4C8 996F B924");
    expect(fp.split(" ")).toHaveLength(8);
  });
});

describe("digestsMatch", () => {
  it("accepts identical digests", async () => {
    const d = await sha256(bytes("same"));
    expect(digestsMatch(d, d)).toBe(true);
  });

  it("rejects different digests", async () => {
    expect(
      digestsMatch(await sha256(bytes("a")), await sha256(bytes("b"))),
    ).toBe(false);
  });

  it("rejects a truncated digest instead of matching on a prefix", async () => {
    const d = await sha256(bytes("same"));
    expect(digestsMatch(d, d.slice(0, 32))).toBe(false);
  });
});
