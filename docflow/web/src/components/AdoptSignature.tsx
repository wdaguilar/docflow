import { useEffect, useRef, useState } from "react";

/**
 * Both tabs produce the same artefact: a transparent PNG data URL. The server
 * only ever embeds an image, so typed and drawn signatures follow one path.
 */
export function AdoptSignature({
  name,
  onClose,
  onAdopt,
}: {
  name: string;
  onClose: () => void;
  onAdopt: (pngDataUrl: string) => void;
}) {
  const [tab, setTab] = useState<"type" | "draw">("type");
  const [typed, setTyped] = useState(name);
  const [consent, setConsent] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [touched, setTouched] = useState(false);
  const pad = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Drawing pad ────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "draw") return;
    const canvas = pad.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#16223a";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let drawing = false;
    let last: { x: number; y: number } | null = null;

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const down = (e: PointerEvent) => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      last = pos(e);
      setDrawn(true);
    };

    const move = (e: PointerEvent) => {
      if (!drawing || !last) return;
      const p = pos(e);
      // Quadratic smoothing through the midpoint keeps strokes from looking jagged.
      const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
      ctx.stroke();
      last = p;
    };

    const up = () => {
      drawing = false;
      last = null;
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", up);
    };
  }, [tab]);

  const clearPad = () => {
    const c = pad.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  };

  /** Render the typed name into a transparent canvas at print resolution. */
  const typedToPng = (): string => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 260;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#16223a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 130;
    do {
      ctx.font = `600 ${size}px "Dancing Script", cursive`;
      if (ctx.measureText(typed).width <= 840) break;
      size -= 6;
    } while (size > 40);
    ctx.fillText(typed, 450, 140);
    return c.toDataURL("image/png");
  };

  const ready = tab === "type" ? typed.trim().length > 0 : drawn;

  const adopt = () => {
    setTouched(true);
    if (!ready || !consent) return;
    onAdopt(tab === "type" ? typedToPng() : pad.current!.toDataURL("image/png"));
  };

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label="Adopt your signature">
      <div className="modal">
        <div className="modal-head">
          <span>Adopt Your Signature</span>
          <button className="x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === "type" ? "on" : ""}`} onClick={() => setTab("type")}>
            Type
          </button>
          <button className={`tab ${tab === "draw" ? "on" : ""}`} onClick={() => setTab("draw")}>
            Draw
          </button>
        </div>

        <div className="modal-body">
          {tab === "type" ? (
            <>
              <div className={`sig-preview ${typed.trim() ? "" : "empty-hint"}`}>
                {typed.trim() || "Your signature appears here"}
              </div>
              <div style={{ marginTop: 16 }}>
                <input
                  className="text-input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Type your full name"
                  maxLength={48}
                  autoFocus
                />
              </div>
            </>
          ) : (
            <>
              <canvas ref={pad} className="draw-pad" />
              <div className="spread" style={{ marginTop: 10 }}>
                <span className="dim" style={{ fontSize: 12.5 }}>
                  Draw with a mouse, trackpad, or finger.
                </span>
                <button className="mini" onClick={clearPad} disabled={!drawn}>
                  Clear
                </button>
              </div>
            </>
          )}

          {touched && !ready && (
            <p className="hint">
              {tab === "type" ? "Type your name to continue." : "Draw your signature to continue."}
            </p>
          )}

          <label className={`consent ${consent ? "ok" : ""}`}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I agree that this signature is the electronic representation of my signature,
              and is as legally binding as my handwritten one.
            </span>
          </label>
          {touched && !consent && <p className="hint">Tick the box to continue.</p>}
        </div>

        <div className="modal-foot">
          <button className="btn-primary" onClick={adopt}>
            Adopt &amp; Sign
          </button>
        </div>
      </div>
    </div>
  );
}
