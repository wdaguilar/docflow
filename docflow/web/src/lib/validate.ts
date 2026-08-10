/**
 * Client-side mirror of the server's recipient rules. This exists for fast
 * feedback only — the server re-checks everything and is the authority.
 */

export const MAX_EXPIRY_DAYS = 365;

export interface SignerDraft {
  name: string;
  email: string;
}

export interface FieldDraft {
  signerIndex: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const isBlankRow = (s: SignerDraft) => !s.name.trim() && !s.email.trim();

export function looksLikeEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(raw.trim().toLowerCase());
}

export interface Prepared {
  signers: SignerDraft[];
  fields: FieldDraft[];
}

/**
 * Drops entirely-empty signer rows and REMAPS every field's signerIndex to the
 * new positions.
 *
 * Without the remap, deleting or skipping a row silently reassigns signature
 * boxes to the wrong person, because the boxes hold positions in the old array.
 */
export function prepareSend(
  signers: SignerDraft[],
  fields: FieldDraft[],
  expiryDays: number,
): { ok: true; value: Prepared } | { ok: false; message: string } {
  const keptIndices: number[] = [];
  signers.forEach((s, i) => {
    if (!isBlankRow(s)) keptIndices.push(i);
  });

  if (keptIndices.length === 0) {
    return { ok: false, message: "Add at least one signer with a name and email." };
  }

  // old position -> new position
  const remap = new Map(keptIndices.map((oldIndex, newIndex) => [oldIndex, newIndex]));

  const seen = new Set<string>();
  const cleaned: SignerDraft[] = [];

  for (const oldIndex of keptIndices) {
    const s = signers[oldIndex]!;
    const name = s.name.trim();
    const email = s.email.trim().toLowerCase();
    const label = name || `Signer ${oldIndex + 1}`;

    if (!name) return { ok: false, message: `Signer ${oldIndex + 1} needs a name.` };
    if (!email) return { ok: false, message: `${label} needs an email address.` };
    if (!looksLikeEmail(email)) {
      return { ok: false, message: `"${s.email.trim()}" isn't a valid email address.` };
    }
    if (seen.has(email)) {
      return { ok: false, message: `${email} is listed more than once.` };
    }
    seen.add(email);
    cleaned.push({ name, email });
  }

  const remapped: FieldDraft[] = [];
  for (const f of fields) {
    const next = remap.get(f.signerIndex);
    // A box belonging to a removed row goes with it.
    if (next === undefined) continue;
    remapped.push({ ...f, signerIndex: next });
  }

  if (remapped.length === 0) {
    return { ok: false, message: "Place at least one signature box on the document." };
  }

  const covered = new Set(remapped.map((f) => f.signerIndex));
  for (let i = 0; i < cleaned.length; i++) {
    if (!covered.has(i)) {
      return { ok: false, message: `${cleaned[i]!.name} has no signature box yet.` };
    }
  }

  if (!Number.isInteger(expiryDays) || expiryDays < 0) {
    return { ok: false, message: "Expiry must be a whole number of days, or 0 for never." };
  }
  if (expiryDays > MAX_EXPIRY_DAYS) {
    return { ok: false, message: `Expiry can be at most ${MAX_EXPIRY_DAYS} days.` };
  }

  return { ok: true, value: { signers: cleaned, fields: remapped } };
}
