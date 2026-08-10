import { describe, expect, it } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { appendCertificate, pageCount, stampSignatures } from "../src/lib/pdf";
import type { AuditRow, FieldRow } from "../src/db";

async function blankPdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return doc.save();
}

// 1x1 transparent PNG.
const MINIMAL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const field = (over: Partial<FieldRow> = {}): FieldRow => ({
  id: "f1",
  document_id: "d1",
  signer_id: "s1",
  kind: "signature",
  page: 0,
  x: 0.1,
  y: 0.8,
  w: 0.3,
  h: 0.06,
  ...over,
});

describe("stampSignatures", () => {
  it("returns a valid PDF with the page count intact", async () => {
    const out = await stampSignatures(await blankPdf(3), [
      { field: field(), png: MINIMAL_PNG },
    ]);
    expect(await pageCount(out)).toBe(3);
    expect(String.fromCharCode(...out.slice(0, 5))).toBe("%PDF-");
  });

  it("actually changes the file", async () => {
    const before = await blankPdf();
    const after = await stampSignatures(before, [
      { field: field(), png: MINIMAL_PNG },
    ]);
    expect(after.byteLength).not.toBe(before.byteLength);
  });

  it("ignores a field pointing past the last page instead of crashing", async () => {
    const out = await stampSignatures(await blankPdf(1), [
      { field: field({ page: 7 }), png: MINIMAL_PNG },
    ]);
    expect(await pageCount(out)).toBe(1);
  });

  it("stamps several fields in one pass", async () => {
    const out = await stampSignatures(await blankPdf(2), [
      { field: field({ id: "a", page: 0 }), png: MINIMAL_PNG },
      { field: field({ id: "b", page: 1, y: 0.2 }), png: MINIMAL_PNG },
    ]);
    expect(await pageCount(out)).toBe(2);
  });

  it("refuses a field that falls outside the page", async () => {
    await expect(
      stampSignatures(await blankPdf(), [
        { field: field({ x: 0.95, w: 0.4 }), png: MINIMAL_PNG },
      ]),
    ).rejects.toThrow(/outside the page/);
  });

  it("can be applied twice, as sequential signing does", async () => {
    const first = await stampSignatures(await blankPdf(), [
      { field: field({ y: 0.7 }), png: MINIMAL_PNG },
    ]);
    const second = await stampSignatures(first, [
      { field: field({ y: 0.85 }), png: MINIMAL_PNG },
    ]);
    expect(await pageCount(second)).toBe(1);
  });
});

describe("appendCertificate", () => {
  const events: AuditRow[] = [
    {
      id: "e1",
      document_id: "d1",
      actor: "sarah@acme.com",
      action: "Signature applied",
      detail: "1 field",
      ip: "203.0.113.7",
      user_agent: "Firefox",
      at: 1_700_000_000_000,
    },
  ];

  it("adds exactly one certificate page to a short document", async () => {
    const out = await appendCertificate(await blankPdf(2), {
      documentId: "d1",
      title: "Consulting Agreement",
      events,
      signers: [
        { name: "Sarah Jenkins", email: "sarah@acme.com", signedAt: 1_700_000_000_000 },
      ],
    });
    expect(await pageCount(out)).toBe(3);
  });

  it("overflows onto extra pages when the audit trail is long", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...events[0]!, id: `e${i}` }));
    const out = await appendCertificate(await blankPdf(1), {
      documentId: "d1",
      title: "Long trail",
      events: many,
      signers: [],
    });
    expect(await pageCount(out)).toBeGreaterThan(2);
  });

  it("handles a signer who never signed", async () => {
    const out = await appendCertificate(await blankPdf(1), {
      documentId: "d1",
      title: "Partial",
      events: [],
      signers: [{ name: "Ghost", email: "ghost@acme.com", signedAt: null }],
    });
    expect(await pageCount(out)).toBe(2);
  });
});
