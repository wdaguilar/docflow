import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toPdfRect, fitContain, type NormRect } from "./coords";
import type { AuditRow, FieldRow } from "../db";

export interface StampJob {
  field: FieldRow;
  /** PNG bytes of the rendered signature. */
  png: Uint8Array;
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

/**
 * Draw each signature into its field. Returns the new PDF bytes.
 */
export async function stampSignatures(
  pdfBytes: Uint8Array,
  jobs: StampJob[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();

  for (const job of jobs) {
    const page = pages[job.field.page];
    if (!page) continue;
    const { width, height } = page.getSize();

    const rect: NormRect = {
      x: job.field.x,
      y: job.field.y,
      w: job.field.w,
      h: job.field.h,
    };
    const box = toPdfRect(rect, width, height);
    const img = await doc.embedPng(job.png);
    const placed = fitContain(box, img.width, img.height);

    page.drawImage(img, {
      x: placed.x,
      y: placed.y,
      width: placed.width,
      height: placed.height,
    });
  }

  return doc.save();
}

/**
 * Bind a certificate of completion onto the end of the document. The audit
 * trail travels with the file, so the proof survives being emailed around.
 */
export async function appendCertificate(
  pdfBytes: Uint8Array,
  opts: {
    documentId: string;
    title: string;
    events: AuditRow[];
    signers: { name: string; email: string; signedAt: number | null }[];
  },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.09, 0.11, 0.16);
  const muted = rgb(0.42, 0.46, 0.55);
  const accent = rgb(0.15, 0.39, 0.92);

  let page = doc.addPage([595.28, 841.89]); // A4
  const M = 56;
  let y = 841.89 - M;

  const line = (
    text: string,
    size: number,
    f = font,
    color = ink,
    gap = 6,
  ) => {
    if (y < M + 40) {
      page = doc.addPage([595.28, 841.89]);
      y = 841.89 - M;
    }
    page.drawText(text, { x: M, y, size, font: f, color });
    y -= size + gap;
  };

  line("Certificate of completion", 20, bold, ink, 10);
  line(opts.title, 11, font, muted, 4);
  line(`Document ID  ${opts.documentId}`, 9, font, muted, 18);

  page.drawLine({
    start: { x: M, y: y + 8 },
    end: { x: 595.28 - M, y: y + 8 },
    thickness: 1,
    color: rgb(0.85, 0.87, 0.91),
  });
  y -= 12;

  line("Signers", 12, bold, accent, 10);
  for (const s of opts.signers) {
    const when = s.signedAt
      ? new Date(s.signedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC"
      : "not signed";
    line(`${s.name}  <${s.email}>`, 10, bold, ink, 2);
    line(`Signed ${when}`, 9, font, muted, 10);
  }

  y -= 6;
  line("Audit trail", 12, bold, accent, 10);
  for (const e of opts.events) {
    const when = new Date(e.at).toISOString().replace("T", " ").slice(0, 19);
    line(`${when} UTC   ${e.action}`, 9, bold, ink, 2);
    const detail = [e.actor, e.detail, e.ip && `IP ${e.ip}`]
      .filter(Boolean)
      .join("  ·  ");
    if (detail) line(`   ${detail.slice(0, 100)}`, 8, font, muted, 6);
  }

  return doc.save();
}

/**
 * Watermark used on the copy served to signers before completion, so an
 * in-flight download can never be passed off as the executed agreement.
 */
export async function watermarkDraft(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText("AWAITING SIGNATURES", {
      x: width * 0.11,
      y: height * 0.45,
      size: 36,
      font,
      color: rgb(0.85, 0.87, 0.91),
      opacity: 0.45,
      rotate: { type: "degrees", angle: 28 } as never,
    });
  }
  return doc.save();
}
