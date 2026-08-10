import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZabcdefghijkmnpqrstvwxyz";

/**
 * URL-safe unguessable token. 24 chars over a 54-char alphabet is ~138 bits,
 * which is what stands between a signing link and the open internet.
 */
export function newToken(length = 24): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function newId(): string {
  return newToken(16);
}

export type AccessDenial =
  | "not_found"
  | "expired"
  | "voided"
  | "awaiting_turn"
  | "already_signed";

export interface AccessInput {
  signer?: { status: "pending" | "active" | "signed" } | null;
  document?: { status: string; expiresAt: number | null } | null;
  now?: number;
}

/**
 * Single source of truth for "may this token open the document right now?".
 * Ordering matters: a voided or expired document beats an unsigned signer.
 */
export function checkAccess(input: AccessInput): AccessDenial | "ok" {
  const now = input.now ?? Date.now();
  if (!input.signer || !input.document) return "not_found";
  if (input.document.status === "voided") return "voided";
  if (input.document.expiresAt !== null && input.document.expiresAt <= now) {
    return "expired";
  }
  if (input.signer.status === "signed") return "already_signed";
  if (input.signer.status === "pending") return "awaiting_turn";
  return "ok";
}
