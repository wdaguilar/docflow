import { useEffect, useState } from "react";
import { Shell } from "../components/Shell";
import { PdfIcon } from "../components/Icons";
import { api, fmtDate, fmtDateTime, type InboxItem } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Inbox() {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    api.inbox().then(setItems).catch(() => setItems([]));
  }, []);

  const waiting = (items ?? []).filter((i) => i.myStatus === "active");
  const later = (items ?? []).filter((i) => i.myStatus === "pending");
  const done = (items ?? []).filter((i) => i.myStatus === "signed");

  return (
    <Shell>
      <div className="topline">
        <div>
          <h1>Documents you need to sign</h1>
          <p className="sub">
            Anything sent to <strong>{user?.email}</strong> shows up here — including
            documents sent before you made an account.
          </p>
        </div>
      </div>

      {items === null ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <PdfIcon size={34} mono />
            <h3>Nothing waiting on you</h3>
            <p>When someone sends you a document to sign, it lands here.</p>
          </div>
        </div>
      ) : (
        <div className="stack">
          {waiting.length > 0 && (
            <div>
              <h2>Waiting on you</h2>
              <div className="stack" style={{ gap: 12 }}>
                {waiting.map((i) => (
                  <div className="card" key={i.documentId}>
                    <div className="spread">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{i.title}</div>
                        <div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
                          From {i.requester}
                          {i.expiresAt ? ` · expires ${fmtDate(i.expiresAt)}` : ""}
                        </div>
                      </div>
                      <a className="btn-primary" href={i.link!}>
                        Review and sign
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {later.length > 0 && (
            <div>
              <h2>Coming up</h2>
              <div className="stack" style={{ gap: 12 }}>
                {later.map((i) => (
                  <div className="card" key={i.documentId}>
                    <div className="spread">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{i.title}</div>
                        <div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
                          From {i.requester} · someone ahead of you is still signing
                        </div>
                      </div>
                      <span className="pill" style={{ background: "#64748b" }}>
                        Up next
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {done.length > 0 && (
            <div>
              <h2>Already signed</h2>
              <div className="stack" style={{ gap: 12 }}>
                {done.map((i) => (
                  <div className="card" key={i.documentId}>
                    <div className="spread">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{i.title}</div>
                        <div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
                          From {i.requester}
                          {i.signedAt ? ` · signed ${fmtDateTime(i.signedAt)}` : ""}
                        </div>
                      </div>
                      <span className="pill" style={{ background: "var(--good)" }}>
                        Signed
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}
