/**
 * Tamper-evidence. We fingerprint the finished PDF and publish the digest on a
 * public /verify page, so anyone holding a copy can prove it is byte-identical
 * to what DocFlow produced.
 */

export async function sha256(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Human-readable grouping, e.g. 3A9F 20B1 ... */
export function fingerprint(digest: string, groups = 8): string {
  return (
    digest
      .slice(0, groups * 4)
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join(" ") ?? ""
  );
}

/** Constant-time-ish comparison so verification can't be probed character by character. */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
