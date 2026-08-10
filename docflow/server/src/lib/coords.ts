/**
 * Field geometry.
 *
 * Fields are stored NORMALISED (0..1) against page width/height so they survive
 * any zoom level or page size. The browser measures from the TOP-left corner;
 * PDF user space measures from the BOTTOM-left. Everything in this file exists
 * to keep that flip in exactly one place.
 */

export interface NormRect {
  /** 0..1 from the left edge */
  x: number;
  /** 0..1 from the TOP edge */
  y: number;
  /** 0..1 of page width */
  w: number;
  /** 0..1 of page height */
  h: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class InvalidRectError extends Error {}

export function assertNormRect(r: NormRect): void {
  for (const [k, v] of Object.entries(r)) {
    if (typeof v !== "number" || Number.isNaN(v)) {
      throw new InvalidRectError(`${k} must be a number`);
    }
  }
  if (r.w <= 0 || r.h <= 0) {
    throw new InvalidRectError("width and height must be positive");
  }
  if (r.x < 0 || r.y < 0 || r.x + r.w > 1.0001 || r.y + r.h > 1.0001) {
    throw new InvalidRectError("rect falls outside the page");
  }
}

/**
 * Convert a top-left normalised rect into bottom-left PDF user space.
 */
export function toPdfRect(
  rect: NormRect,
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  assertNormRect(rect);
  const width = rect.w * pageWidth;
  const height = rect.h * pageHeight;
  return {
    x: rect.x * pageWidth,
    // flip: distance from bottom = page height - distance from top - box height
    y: pageHeight - rect.y * pageHeight - height,
    width,
    height,
  };
}

/**
 * Inverse of toPdfRect. Used when importing pre-placed AcroForm fields.
 */
export function fromPdfRect(
  rect: PdfRect,
  pageWidth: number,
  pageHeight: number,
): NormRect {
  return {
    x: rect.x / pageWidth,
    y: (pageHeight - rect.y - rect.height) / pageHeight,
    w: rect.width / pageWidth,
    h: rect.height / pageHeight,
  };
}

/**
 * Fit a signature image inside its field without distorting it, centred.
 */
export function fitContain(
  box: PdfRect,
  imgWidth: number,
  imgHeight: number,
): PdfRect {
  const scale = Math.min(box.width / imgWidth, box.height / imgHeight);
  const width = imgWidth * scale;
  const height = imgHeight * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}
