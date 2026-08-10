import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPage {
  index: number;
  width: number;
  height: number;
}

/**
 * Renders every page of a PDF to canvas and reports each page's on-screen box,
 * which is what field overlays are positioned against.
 */
export function PdfPages({
  url,
  scale = 1.25,
  overlay,
  onPageClick,
}: {
  url: string;
  scale?: number;
  overlay?: (page: RenderedPage) => React.ReactNode;
  onPageClick?: (page: number, xNorm: number, yNorm: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvases: HTMLCanvasElement[] = [];

    (async () => {
      try {
        const pdf = await pdfjs.getDocument(url).promise;
        if (cancelled) return;
        const measured: RenderedPage[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;
          // Render at device resolution so signatures stay crisp on retina.
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          ctx.scale(dpr, dpr);
          await page.render({ canvasContext: ctx, viewport }).promise;
          canvases.push(canvas);
          measured.push({ index: i - 1, width: viewport.width, height: viewport.height });
        }

        if (cancelled) return;
        setPages(measured);
        // Attach canvases after React paints their wrappers.
        requestAnimationFrame(() => {
          canvases.forEach((c, i) => {
            const slot = host.current?.querySelector(`[data-page="${i}"] .slot`);
            if (slot && !slot.firstChild) slot.appendChild(c);
          });
        });
      } catch (e) {
        if (!cancelled) setError("This document could not be displayed.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, scale]);

  if (error) return <p className="muted center">{error}</p>;
  if (pages.length === 0) return <p className="muted center">Loading document…</p>;

  return (
    <div ref={host} className="stack" style={{ alignItems: "center" }}>
      {pages.map((p) => (
        <div
          key={p.index}
          className="page-wrap"
          data-page={p.index}
          style={{ width: p.width, height: p.height }}
          onClick={
            onPageClick
              ? (e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onPageClick(
                    p.index,
                    (e.clientX - r.left) / r.width,
                    (e.clientY - r.top) / r.height,
                  );
                }
              : undefined
          }
        >
          <div className="slot" />
          {overlay?.(p)}
        </div>
      ))}
    </div>
  );
}
