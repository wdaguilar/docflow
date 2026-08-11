import { describe, expect, it } from "bun:test";
import { RateLimiter, LOGIN_RULE } from "../src/lib/ratelimit";

const NOW = 1_700_000_000_000;
const rule = { limit: 3, windowMs: 60_000 };

describe("RateLimiter", () => {
  it("allows requests up to the limit", () => {
    const rl = new RateLimiter(rule);
    for (let i = 0; i < 3; i++) {
      expect(rl.check("ip", NOW).allowed).toBe(true);
    }
  });

  it("blocks the request past the limit", () => {
    const rl = new RateLimiter(rule);
    for (let i = 0; i < 3; i++) rl.check("ip", NOW);
    expect(rl.check("ip", NOW).allowed).toBe(false);
  });

  it("counts down the remaining allowance", () => {
    const rl = new RateLimiter(rule);
    expect(rl.check("ip", NOW).remaining).toBe(2);
    expect(rl.check("ip", NOW).remaining).toBe(1);
    expect(rl.check("ip", NOW).remaining).toBe(0);
  });

  it("reports how long until the window resets", () => {
    const rl = new RateLimiter(rule);
    for (let i = 0; i < 3; i++) rl.check("ip", NOW);
    const d = rl.check("ip", NOW + 20_000);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBe(40_000);
  });

  it("lets requests through once the window passes", () => {
    const rl = new RateLimiter(rule);
    for (let i = 0; i < 3; i++) rl.check("ip", NOW);
    expect(rl.check("ip", NOW + 60_001).allowed).toBe(true);
  });

  /* One attacker must not be able to lock out everyone else. */
  it("keeps separate counts per key", () => {
    const rl = new RateLimiter(rule);
    for (let i = 0; i < 3; i++) rl.check("attacker", NOW);
    expect(rl.check("attacker", NOW).allowed).toBe(false);
    expect(rl.check("someone-else", NOW).allowed).toBe(true);
  });

  /* A correct password should clear the failure count, so a user who mistypes
     twice then succeeds is not left near the limit. */
  it("clears a key on reset", () => {
    const rl = new RateLimiter(rule);
    for (let i = 0; i < 3; i++) rl.check("ip", NOW);
    expect(rl.check("ip", NOW).allowed).toBe(false);
    rl.reset("ip");
    expect(rl.check("ip", NOW).allowed).toBe(true);
  });

  it("sweeps lapsed buckets so memory cannot grow without bound", () => {
    const rl = new RateLimiter(rule);
    for (let i = 0; i < 500; i++) rl.check(`ip-${i}`, NOW);
    expect(rl.size).toBe(500);
    expect(rl.sweep(NOW + 60_001)).toBe(500);
    expect(rl.size).toBe(0);
  });

  it("keeps live buckets during a sweep", () => {
    const rl = new RateLimiter(rule);
    rl.check("old", NOW);
    rl.check("new", NOW + 50_000);
    rl.sweep(NOW + 60_001);
    expect(rl.size).toBe(1);
    expect(rl.check("new", NOW + 60_001).remaining).toBe(1);
  });

  it("sets a login allowance tight enough to stop credential stuffing", () => {
    expect(LOGIN_RULE.limit).toBeLessThanOrEqual(10);
    expect(LOGIN_RULE.windowMs).toBeGreaterThanOrEqual(10 * 60_000);
  });
});
