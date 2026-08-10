import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { StatusPill } from "../components/StatusPill";
import { PdfIcon } from "../components/Icons";
import { api, fileUrl, fmtDate, type DocSummary } from "../lib/api";

export function Dashboard({ onlySent = false }: { onlySent?: boolean }) {
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const nav = useNavigate();

  const load = () => {
    api.list().then(setDocs).catch(() => setDocs([]));
  };
  useEffect(load, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const remind = async (d: DocSummary) => {
    setBusy(d.id);
    try {
      const r = await api.remind(d.id);
      setToast(
        r.reminded > 0
          ? `Reminded ${r.reminded} signer${r.reminded === 1 ? "" : "s"}.`
          : "No one is waiting on this document.",
      );
    } finally {
      setBusy(null);
    }
  };

  const rows = (docs ?? []).filter((d) => (onlySent ? d.status !== "draft" : true));

  return (
    <Shell>
      <div className="topline">
        <div>
          <h1>{onlySent ? "Sent Documents" : "Welcome Back, Alex!"}</h1>
          <p className="sub">
            {onlySent
              ? "Everything you've sent out, and where each one stands."
              : "Send a PDF out for signature and track it to completion."}
          </p>
        </div>
        <button className="btn-primary" onClick={() => nav("/new")}>
          Upload &amp; New Request
        </button>
      </div>

      {toast && <div className="note">{toast}</div>}

      <h2>{onlySent ? "All requests" : "Recent Documents"}</h2>

      <div className="panel">
        {docs === null ? (
          <div className="empty">
            <p>Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <PdfIcon size={34} mono />
            <h3>Nothing here yet</h3>
            <p>Upload a PDF, drop a signature box on it, and send it out.</p>
            <button className="btn-primary" onClick={() => nav("/new")}>
              Upload &amp; New Request
            </button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Status</th>
                <th>Recipients</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="doc-cell">
                      <PdfIcon mono={d.status === "draft"} />
                      <span className="doc-name" title={d.title}>
                        {d.title}
                      </span>
                    </div>
                  </td>
                  <td>
                    <StatusPill status={d.status} />
                  </td>
                  <td className="count">
                    {d.recipients > 0
                      ? `${d.signedCount}/${d.recipients}`
                      : "0"}
                  </td>
                  <td className="count">{fmtDate(d.updatedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="mini" onClick={() => nav(`/documents/${d.id}`)}>
                        View
                      </button>
                      <a
                        className="mini"
                        href={fileUrl(d.id)}
                        download={`${d.title}.pdf`}
                        style={{ display: "inline-block", textAlign: "center" }}
                      >
                        Download
                      </a>
                      <button
                        className="mini"
                        disabled={d.status !== "awaiting_others" || busy === d.id}
                        onClick={() => remind(d)}
                      >
                        {busy === d.id ? "Sending…" : "Reminder"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
