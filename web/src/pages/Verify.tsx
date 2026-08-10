import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { api, fmtDateTime } from "../lib/api";

export function Verify() {
  const [params] = useSearchParams();
  const [result, setResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [record, setRecord] = useState<any>(null);

  const id = params.get("id");
  useEffect(() => {
    if (id) api.verifyById(id).then(setRecord).catch(() => setRecord(null));
  }, [id]);

  const check = async (file: File) => {
    setChecking(true);
    setResult(null);
    try {
      setResult(await api.verifyFile(file));
    } catch (e: any) {
      setResult({
        verified: false,
        message:
          "No DocFlow document matches this file. It was either altered after signing or produced elsewhere.",
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Shell>
      <div className="topline">
        <div>
          <h1>Verify a signed document</h1>
          <p className="sub">
            Every completed document is fingerprinted with SHA-256. Upload a copy and
            we'll tell you whether a single byte has changed.
          </p>
        </div>
      </div>

      <div className="split">
        <div className="card">
          <h2>Check a file</h2>
          <label className="btn-primary" style={{ cursor: "pointer", display: "inline-block" }}>
            {checking ? "Checking…" : "Choose a PDF"}
            <input
              type="file"
              accept="application/pdf"
              hidden
              disabled={checking}
              onChange={(e) => e.target.files?.[0] && check(e.target.files[0])}
            />
          </label>

          {result && (
            <div
              style={{
                marginTop: 20,
                padding: 18,
                borderRadius: 10,
                background: result.verified ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)",
                border: `1px solid ${result.verified ? "rgba(34,197,94,.4)" : "rgba(239,68,68,.4)"}`,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  color: result.verified ? "var(--good)" : "var(--bad)",
                }}
              >
                {result.verified ? "✓ Authentic" : "✕ No match"}
              </div>
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 13.5 }}>
                {result.verified
                  ? `This is byte-for-byte the copy DocFlow issued for "${result.title}".`
                  : result.message}
              </p>
              {result.sha256 && (
                <p className="mono dim" style={{ wordBreak: "break-all", marginTop: 10 }}>
                  {result.sha256}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Document record</h2>
          {!record ? (
            <p className="muted" style={{ fontSize: 13.5 }}>
              Open this page from a completed document to see its published record.
            </p>
          ) : (
            <>
              <div className="kv">
                <span>Title</span>
                <span>{record.title}</span>
              </div>
              <div className="kv">
                <span>Completed</span>
                <span>{fmtDateTime(record.completedAt)}</span>
              </div>
              <div className="kv">
                <span>Fingerprint</span>
                <span className="mono">{record.fingerprint}</span>
              </div>
              {record.signers.map((s: any, i: number) => (
                <div className="kv" key={i}>
                  <span>{s.name}</span>
                  <span>{s.signedAt ? fmtDateTime(s.signedAt) : "—"}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
