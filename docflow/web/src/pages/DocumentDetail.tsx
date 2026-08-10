import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { StatusPill } from "../components/StatusPill";
import { api, fileUrl, fmtDate, fmtDateTime, type DocDetail } from "../lib/api";

export function DocumentDetail() {
  const { id } = useParams();
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const load = () =>
    api
      .get(id!)
      .then(setDoc)
      .catch(() => setMissing(true));

  useEffect(() => {
    load();
    // Poll so the requester watches signatures land without refreshing.
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [id]);

  if (missing)
    return (
      <Shell>
        <div className="banner">
          <h1>Document not found</h1>
          <p className="muted">It may have been removed.</p>
          <Link to="/" className="btn-ghost" style={{ display: "inline-block", marginTop: 16 }}>
            Back to dashboard
          </Link>
        </div>
      </Shell>
    );

  if (!doc)
    return (
      <Shell>
        <p className="muted">Loading…</p>
      </Shell>
    );

  const copy = (link: string, key: string) => {
    navigator.clipboard.writeText(`${location.origin}${link}`);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <Shell>
      <div className="topline">
        <div>
          <h1 style={{ fontSize: 27 }}>{doc.title}</h1>
          <p className="sub">
            <StatusPill status={doc.status} />{" "}
            <span style={{ marginLeft: 10 }}>
              {doc.signedCount} of {doc.recipients} signed · {doc.pageCount} page
              {doc.pageCount === 1 ? "" : "s"} · updated {fmtDate(doc.updatedAt)}
            </span>
          </p>
        </div>
        <div className="row">
          {doc.status === "awaiting_others" && (
            <button className="btn-ghost" onClick={() => api.remind(doc.id).then(load)}>
              Send reminder
            </button>
          )}
          <a className="btn-primary" href={fileUrl(doc.id)} download={`${doc.title}.pdf`}>
            {doc.status === "completed" ? "Download signed copy" : "Download current copy"}
          </a>
        </div>
      </div>

      {doc.status === "completed" && (
        <div className="note">
          Signed and sealed. The download includes a certificate page listing every signer
          and the full audit trail.{" "}
          <Link to={`/verify?id=${doc.id}`} style={{ color: "#cfe0ff", fontWeight: 600 }}>
            Verify this document →
          </Link>
        </div>
      )}

      <div className="split">
        <div className="card">
          <h2>Signers</h2>
          {doc.signers.map((s) => (
            <div
              key={s.id}
              style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}
            >
              <div className="spread">
                <div>
                  <div style={{ fontWeight: 600 }}>{s.name}</div>
                  <div className="dim" style={{ fontSize: 12.5 }}>
                    {s.email}
                  </div>
                </div>
                <span
                  className="pill"
                  style={{
                    background:
                      s.status === "signed"
                        ? "var(--good)"
                        : s.status === "active"
                          ? "var(--blue)"
                          : "#64748b",
                  }}
                >
                  {s.status === "signed"
                    ? "Signed"
                    : s.status === "active"
                      ? "Waiting on them"
                      : "Up next"}
                </span>
              </div>

              {s.signedAt && (
                <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Signed {fmtDateTime(s.signedAt)}
                </div>
              )}

              {/* The link is the delivery mechanism that always works, with or
                  without mail credentials configured. */}
              {s.link && (
                <div className="copy-link">
                  <input readOnly value={`${location.origin}${s.link}`} />
                  <button className="mini" onClick={() => copy(s.link!, s.id)}>
                    {copied === s.id ? "Copied" : "Copy link"}
                  </button>
                  <a className="mini" href={s.link} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Audit trail</h2>
          <ul className="trail">
            {doc.audit.map((e) => (
              <li key={e.id}>
                <div>
                  <div className="act">{e.action}</div>
                  <div className="meta">
                    {fmtDateTime(e.at)} · {e.actor}
                    {e.detail ? ` · ${e.detail}` : ""}
                    {e.ip ? ` · ${e.ip}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {doc.fingerprint && (
            <>
              <h2 style={{ marginTop: 22 }}>Fingerprint</h2>
              <p className="mono muted" style={{ wordBreak: "break-all", margin: 0 }}>
                {doc.fingerprint}
              </p>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
