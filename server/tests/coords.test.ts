import { describe, expect, it } from "bun:test";
import {
  toPdfRect,
  fromPdfRect,
  fitContain,
  assertNormRect,
  InvalidRectError,
} from "../src/lib/coords";

const A4 = { w: 595, h: 842 };

describe("toPdfRect", () => {
  it("flips the origin from top-left to bottom-left", () => {
    // A box at the very top of the page must land at the very top in PDF space,
    // which means a HIGH y once measured from the bottom.
    const r = toPdfRect({ x: 0, y: 0, w: 0.2, h: 0.1 }, A4.w, A4.h);
    expect(r.y + r.height).toBeCloseTo(A4.h, 5);
    expect(r.x).toBe(0);
  });

  it("puts a bottom-anchored box at y = 0", () => {
    const r = toPdfRect({ x: 0, y: 0.9, w: 0.2, h: 0.1 }, A4.w, A4.h);
    expect(r.y).toBeCloseTo(0, 5);
  });

  it("scales width and height by the page dimensions", () => {
    const r = toPdfRect({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 800, 400);
    expect(r.x).toBe(200);
    expect(r.width).toBe(400);
    expect(r.height).toBe(100);
    expect(r.y).toBe(400 - 200 - 100);
  });

  it("round-trips through fromPdfRect", () => {
    const original = { x: 0.13, y: 0.42, w: 0.3, h: 0.08 };
    const back = fromPdfRect(toPdfRect(original, A4.w, A4.h), A4.w, A4.h);
    expect(back.x).toBeCloseTo(original.x, 6);
    expect(back.y).toBeCloseTo(original.y, 6);
    expect(back.w).toBeCloseTo(original.w, 6);
    expect(back.h).toBeCloseTo(original.h, 6);
  });

  it("survives a landscape page", () => {
    const r = toPdfRect({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, 842, 595);
    expect(r.x).toBeCloseTo(421, 5);
    expect(r.y).toBeCloseTo(595 - 297.5 - 59.5, 5);
  });
});

describe("assertNormRect", () => {
  it("rejects a rect that runs off the page", () => {
    expect(() => assertNormRect({ x: 0.9, y: 0.5, w: 0.3, h: 0.1 })).toThrow(
      InvalidRectError,
    );
  });

  it("rejects zero-area rects", () => {
    expect(() => assertNormRect({ x: 0.1, y: 0.1, w: 0, h: 0.1 })).toThrow();
  });

  it("rejects negative coordinates", () => {
    expect(() => assertNormRect({ x: -0.1, y: 0.1, w: 0.2, h: 0.1 })).toThrow();
  });

  it("accepts a rect flush against the far edge", () => {
    expect(() => assertNormRect({ x: 0.8, y: 0.9, w: 0.2, h: 0.1 })).not.toThrow();
  });
});

describe("fitContain", () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it("never distorts the aspect ratio", () => {
    const out = fitContain(box, 400, 100); // 4:1 into a 2:1 box
    expect(out.width / out.height).toBeCloseTo(4, 5);
    expect(out.width).toBeLessThanOrEqual(box.width + 1e-9);
    expect(out.height).toBeLessThanOrEqual(box.height + 1e-9);
  });

  it("centres the image inside the field", () => {
    const out = fitContain(box, 400, 100);
    expect(out.x + out.width / 2).toBeCloseTo(box.x + box.width / 2, 5);
    expect(out.y + out.height / 2).toBeCloseTo(box.y + box.height / 2, 5);
  });

  it("constrains by height when the image is tall", () => {
    const out = fitContain(box, 100, 400);
    expect(out.height).toBeCloseTo(100, 5);
  });
});
