/**
 * Validation for the send-for-signature payload.
 *
 * The client does the same checks for fast feedback, but this is the copy that
 * decides. Anything reaching here has already crossed the network and may not
 * have come from the form at all.
 */
import { validateEmail, normaliseEmail } from "./auth";
import { assertNormRect, InvalidRectError } from "./coords";

export const MAX_SIGNERS = 20;
export const MAX_EXPIRY_DAYS = 365;

export interface RawSigner {
  name: string;
  email: string;
}

export interface RawField {
  signerIndex: number;
  kind?: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Invalid = { ok: false; error: string; message: string };
type Valid<T> = { ok: true; value: T };
export type Result<T> = Valid<T> | Invalid;

const bad = (error: string, message: string): Invalid => ({ ok: false, error, message });

const ordinal = (i: number) => `Signer ${i + 1}`;

/**
 * Names and emails, normalised. Rejects duplicates: the same person twice in
 * one document would get two links and two inbox rows for one signature.
 */
export function validateSigners(signers: RawSigner[]): Result<RawSigner[]> {
  if (!Array.isArray(signers) || signers.length === 0) {
    return bad("signers_required", "Add at least one signer.");
  }
  if (signers.length > MAX_SIGNERS) {
    return bad("too_many_signers", `A document can have at most ${MAX_SIGNERS} signers.`);
  }

  const cleaned: RawSigner[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < signers.length; i++) {
    const raw = signers[i]!;
    const name = String(raw?.name ?? "").trim();
    const email = normaliseEmail(String(raw?.email ?? ""));

    if (!name) return bad("signer_name_required", `${ordinal(i)} needs a name.`);
    if (name.length > 120) {
      return bad("signer_name_too_long", `${ordinal(i)}'s name is too long.`);
    }

    const emailProblem = validateEmail(email);
    if (emailProblem !== "ok") {
      return bad(
        "signer_email_invalid",
        `${name} needs a valid email address — "${raw.email}" isn't one.`,
      );
    }

    if (seen.has(email)) {
      return bad("duplicate_signer", `${email} is listed more than once.`);
    }
    seen.add(email);

    cleaned.push({ name, email });
  }

  return { ok: true, value: cleaned };
}

/**
 * Every field must point at a real signer and sit on a real page, and every
 * signer must have somewhere to sign — otherwise they receive a link to a
 * document they cannot complete.
 */
export function validateFields(
  fields: RawField[],
  signerCount: number,
  pageCount: number,
): Result<RawField[]> {
  if (!Array.isArray(fields) || fields.length === 0) {
    return bad("fields_required", "Place at least one signature box on the document.");
  }

  const covered = new Set<number>();

  for (const f of fields) {
    if (!Number.isInteger(f.signerIndex) || f.signerIndex < 0 || f.signerIndex >= signerCount) {
      return bad(
        "field_signer_unknown",
        "A signature box is assigned to a signer who isn't on this document.",
      );
    }
    if (!Number.isInteger(f.page) || f.page < 0 || f.page >= pageCount) {
      return bad("field_page_out_of_range", "A signature box is on a page that doesn't exist.");
    }
    try {
      assertNormRect({ x: f.x, y: f.y, w: f.w, h: f.h });
    } catch (err) {
      return bad(
        "field_out_of_bounds",
        err instanceof InvalidRectError
          ? "A signature box falls outside the page."
          : "A signature box has invalid dimensions.",
      );
    }
    covered.add(f.signerIndex);
  }

  for (let i = 0; i < signerCount; i++) {
    if (!covered.has(i)) {
      return bad("signer_without_field", `${ordinal(i)} has no signature box yet.`);
    }
  }

  return { ok: true, value: fields };
}

/** Returns an absolute expiry timestamp, or null for "never". */
export function resolveExpiry(days: unknown, now = Date.now()): Result<number | null> {
  if (days === undefined || days === null || days === 0) return { ok: true, value: null };
  if (typeof days !== "number" || !Number.isFinite(days)) {
    return bad("expiry_invalid", "Expiry must be a number of days.");
  }
  if (!Number.isInteger(days)) {
    return bad("expiry_invalid", "Expiry must be a whole number of days.");
  }
  if (days < 0) {
    return bad("expiry_negative", "Expiry can't be in the past.");
  }
  if (days > MAX_EXPIRY_DAYS) {
    return bad("expiry_too_far", `Expiry can be at most ${MAX_EXPIRY_DAYS} days out.`);
  }
  return { ok: true, value: now + days * 864e5 };
}
