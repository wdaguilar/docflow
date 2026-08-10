/**
 * Account logic, kept pure so the rules are testable without a database.
 *
 * Design note: signers never need an account. A signing token alone opens the
 * document, exactly as DocuSign works, because forcing registration before a
 * signature is the single biggest drop-off in an e-signing flow. Accounts exist
 * so a *requester* can own their documents, and so anyone who does have one
 * sees the documents waiting on them in one place.
 */

export const SESSION_TTL_MS = 30 * 864e5; // 30 days

export type EmailProblem = "missing" | "malformed" | "too_long";
export type PasswordProblem = "missing" | "too_short" | "too_long" | "too_common";

/** Lowercase and trim, so Sarah@Acme.com and sarah@acme.com are one person. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string): EmailProblem | "ok" {
  const email = normaliseEmail(raw);
  if (!email) return "missing";
  if (email.length > 254) return "too_long";
  // Deliberately permissive: the only real proof an address works is sending to it.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return "malformed";
  return "ok";
}

const COMMON = new Set([
  "password", "password1", "12345678", "123456789", "qwertyui",
  "letmein1", "welcome1", "iloveyou", "adminadmin", "changeme",
]);

export function validatePassword(pw: string): PasswordProblem | "ok" {
  if (!pw) return "missing";
  if (pw.length < 8) return "too_short";
  // bcrypt-family hashes silently truncate past 72 bytes; reject rather than mislead.
  if (new TextEncoder().encode(pw).length > 72) return "too_long";
  if (COMMON.has(pw.toLowerCase())) return "too_common";
  return "ok";
}

export const PASSWORD_HELP: Record<PasswordProblem, string> = {
  missing: "Enter a password.",
  too_short: "Use at least 8 characters.",
  too_long: "That password is too long — keep it under 72 characters.",
  too_common: "That password is too easy to guess. Pick something less common.",
};

export const EMAIL_HELP: Record<EmailProblem, string> = {
  missing: "Enter your email address.",
  malformed: "That doesn't look like an email address.",
  too_long: "That email address is too long.",
};

export function sessionExpiry(now = Date.now()): number {
  return now + SESSION_TTL_MS;
}

export function sessionIsLive(expiresAt: number, now = Date.now()): boolean {
  return expiresAt > now;
}

/** Fall back to the local part so a new account always has something to greet. */
export function displayName(name: string | null, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const local = email.split("@")[0] ?? "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}
