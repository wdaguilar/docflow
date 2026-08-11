/**
 * Fixed-window rate limiting, in memory.
 *
 * Scope note: this is per-process. One machine is the current deployment, so it
 * holds; behind multiple replicas it would need Redis or similar. Stated here
 * rather than discovered later.
 */

export interface Decision {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Milliseconds until the window resets. */
  retryAfterMs: number;
}

export interface Rule {
  /** Requests permitted per window. */
  limit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private rule: Rule) {}

  check(key: string, now = Date.now()): Decision {
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.rule.windowMs });
      return { allowed: true, remaining: this.rule.limit - 1, retryAfterMs: 0 };
    }

    if (bucket.count >= this.rule.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
    }

    bucket.count++;
    return {
      allowed: true,
      remaining: this.rule.limit - bucket.count,
      retryAfterMs: 0,
    };
  }

  /** Called after a success, so a correct password clears the failure count. */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Drops lapsed buckets so the map cannot grow without bound. */
  sweep(now = Date.now()): number {
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.buckets.size;
  }
}

const MINUTE = 60_000;

/** Credential stuffing is the loudest threat, so login is the tightest. */
export const LOGIN_RULE: Rule = { limit: 8, windowMs: 15 * MINUTE };
export const SIGNUP_RULE: Rule = { limit: 5, windowMs: 60 * MINUTE };
/** Signing tokens are unguessable, but this caps enumeration attempts anyway. */
export const TOKEN_RULE: Rule = { limit: 60, windowMs: 15 * MINUTE };
export const UPLOAD_RULE: Rule = { limit: 30, windowMs: 60 * MINUTE };
export const VERIFY_RULE: Rule = { limit: 20, windowMs: 15 * MINUTE };
