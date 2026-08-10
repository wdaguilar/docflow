import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { PdfPages } from "../components/PdfPages";
import { PdfIcon } from "../components/Icons";
import { api, fileUrl, type DocSummary } from "../lib/api";

interface Draft {
  signerIndex: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const BOX = { w: 0.26, h: 0.055 };
const PALETTE = ["#2f7bf6", "#22c55e", "#f59e0b", "#a855f7"];

export function NewRequest() {
  const [doc, setDoc] = useState<DocSummary | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [signers, setSigners] = useState([{ name: "", email: "" }]);
  const [fields, setFields] = useState<Draft[]>([]);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"sequential" | "parallel">("sequential");
  const [expiry, setExpiry] = useState(14);
  const [sending, setSending] = useState(false);
  const nav = useNavigate();

  const upload = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("That file isn't a PDF. Choose a .pdf and try again.");
      return;
    }
    setUploading(true);
    try {
      const d = await api.upload(file, title || file.name.replace(/\.pdf$/i, ""));
      setDoc(d);
      setTitle(d.title);
    } catch (e: any) {
      setError(
        e.code === "file_too_large"
          ? "That PDF is over the 15 MB limit."
          : e.code === "not_a_pdf"
            ? "That file isn't a valid PDF."
            : "Upload failed. Check your connection and try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    setError(null);
    const clean = signers.filter((s) => s.name.trim() && s.email.trim());
    if (clean.length === 0) return setError("Add at least one signer with a name and email.");
    if (fields.length === 0) return setError("Place at least one signature box on the document.");
    const covered = new Set(fields.map((f) => f.signerIndex));
    const missing = clean.findIndex((_, i) => !covered.has(i));
    if (missing !== -1)
      return setError(`${clean[missing]!.name || "Signer " + (missing + 1)} has no signature box yet.`);

    setSending(true);
    try {
      await api.send(doc!.id, {
        mode,
        expiresInDays: expiry || undefined,
        signers: clean,
        fields,
      });
      nav(`/documents/${doc!.id}`);
    } catch {
      setError("Could not send the request. Try again.");
      setSending(false);
    }
  };

  // ── Upload step ──────────────────────────────────────────────────
  if (!doc) {
    return (
      <Shell>
        <div className="topline">
          <div>
            <h1>New signature request</h1>
            <p className="sub">Start with the PDF you need signed.</p>
          </div>
        </div>

        {error && <div className="note">{error}</div>}

        <div className="card" style={{ maxWidth: 640 }}>
          <label className="f" htmlFor="doctitle">
            Document name
          </label>
          <input
            id="doctitle"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Consulting Agreement"
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) upload(f);
            }}
            style={{
              marginTop: 18,
              border: `2px dashed ${dragOver ? "var(--blue)" : "var(--line)"}`,
              background: dragOver ? "rgba(47,123,246,0.08)" : "transparent",
              borderRadius: 12,
              padding: "44px 20px",
              textAlign: "center",
              transition: "border-color .15s, background .15s",
            }}
          >
            <PdfIcon size={38} mono />
            <p style={{ margin: "12px 0 4px", fontWeight: 600 }}>
              Drop your PDF here
            </p>
            <p className="dim" style={{ margin: "0 0 18px", fontSize: 13 }}>
              Up to 15 MB
            </p>
            <label className="btn-primary" style={{ cursor: "pointer", display: "inline-block" }}>
              {uploading ? "Uploading…" : "Choose file"}
              <input
                type="file"
                accept="application/pdf"
                hidden
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
            </label>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Prepare step ─────────────────────────────────────────────────
  return (
    <Shell>
      <div className="topline">
        <div>
          <h1 style={{ fontSize: 27 }}>{doc.title}</h1>
          <p className="sub">
            Pick a signer, then click the page where their signature belongs.
          </p>
        </div>
        <button className="btn-primary" onClick={send} disabled={sending}>
          {sending ? "Sending…" : "Send for signature"}
        </button>
      </div>

      {error && <div className="note">{error}</div>}

      <div className="split">
        <div className="viewer">
          <PdfPages
            url={fileUrl(doc.id)}
            onPageClick={(page, x, y) =>
              setFields((f) => [
                ...f,
                {
                  signerIndex: active,
                  page,
                  x: Math.min(Math.max(x - BOX.w / 2, 0), 1 - BOX.w),
                  y: Math.min(Math.max(y - BOX.h / 2, 0), 1 - BOX.h),
                  ...BOX,
                },
              ])
            }
            overlay={(p) =>
              fields
                .map((f, i) => ({ f, i }))
                .filter(({ f }) => f.page === p.index)
                .map(({ f, i }) => (
                  <div
                    key={i}
                    className="field-tab placing"
                    style={{
                      left: f.x * p.width,
                      top: f.y * p.height,
                      width: f.w * p.width,
                      height: f.h * p.height,
                      borderColor: PALETTE[f.signerIndex % PALETTE.length],
                      color: PALETTE[f.signerIndex % PALETTE.length],
                    }}
                    title="Click to remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFields((prev) => prev.filter((_, j) => j !== i));
                    }}
                  >
                    {signers[f.signerIndex]?.name || `Signer ${f.signerIndex + 1}`}
                  </div>
                ))
            }
          />
        </div>

        <div>
          <div className="card">
            <h2>Signers</h2>
            {signers.map((s, i) => (
              <div key={i} className="signer-row">
                <span
                  className="ord"
                  style={{
                    borderColor: PALETTE[i % PALETTE.length],
                    color: PALETTE[i % PALETTE.length],
                  }}
                >
                  {i + 1}
                </span>
                <input
                  className="input"
                  placeholder="Full name"
                  value={s.name}
                  onFocus={() => setActive(i)}
                  onChange={(e) =>
                    setSigners((p) =>
                      p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className="input"
                  placeholder="email@company.com"
                  value={s.email}
                  onFocus={() => setActive(i)}
                  onChange={(e) =>
                    setSigners((p) =>
                      p.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)),
                    )
                  }
                />
                <button
                  className="trash"
                  aria-label={`Remove signer ${i + 1}`}
                  disabled={signers.length === 1}
                  onClick={() => {
                    setSigners((p) => p.filter((_, j) => j !== i));
                    setFields((p) =>
                      p
                        .filter((f) => f.signerIndex !== i)
                        .map((f) => ({
                          ...f,
                          signerIndex: f.signerIndex > i ? f.signerIndex - 1 : f.signerIndex,
                        })),
                    );
                    setActive(0);
                  }}
                >
                  ×
                </button>
              </div>
            ))}

            <div className="row" style={{ marginTop: 6 }}>
              <button
                className="btn-ghost"
                onClick={() => setSigners((p) => [...p, { name: "", email: "" }])}
              >
                + Add signer
              </button>
              <span className="dim" style={{ fontSize: 12.5 }}>
                Placing boxes for <strong style={{ color: PALETTE[active % PALETTE.length] }}>
                  {signers[active]?.name || `Signer ${active + 1}`}
                </strong>
              </span>
            </div>
          </div>

          <div className="card">
            <h2>Options</h2>
            <label className="f">Signing order</label>
            <div className="grid2">
              <button
                className="btn-ghost"
                style={mode === "sequential" ? { borderColor: "var(--blue)", color: "#fff" } : {}}
                onClick={() => setMode("sequential")}
              >
                One at a time
              </button>
              <button
                className="btn-ghost"
                style={mode === "parallel" ? { borderColor: "var(--blue)", color: "#fff" } : {}}
                onClick={() => setMode("parallel")}
              >
                All at once
              </button>
            </div>

            <label className="f" style={{ marginTop: 16 }} htmlFor="exp">
              Link expires after
            </label>
            <div className="row">
              <input
                id="exp"
                className="input"
                type="number"
                min={0}
                max={365}
                value={expiry}
                onChange={(e) => setExpiry(Number(e.target.value))}
                style={{ width: 100 }}
              />
              <span className="dim">days · 0 means never</span>
            </div>

            <p className="dim" style={{ fontSize: 12.5, marginTop: 16, marginBottom: 0 }}>
              {fields.length} signature box{fields.length === 1 ? "" : "es"} placed. Click a box to remove it.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
