import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { SignerShell } from "../components/Shell";
import { PdfPages } from "../components/PdfPages";
import { AdoptSignature } from "../components/AdoptSignature";
import { Logo } from "../components/Logo";
import { api, signerFileUrl, fmtDate, type SignerView } from "../lib/api";

const DENIAL: Record<string, { title: string; body: string }> = {
  not_found: {
    title: "This link isn't valid",
    body: "Check that you copied the whole link, or ask the sender for a new one.",
  },
  expired: {
    title: "This link has expired",
    body: "Ask the sender to reissue the request and you'll get a fresh link.",
  },
  voided: {
    title: "This request was cancelled",
    body: "The sender withdrew the document. Nothing further is needed from you.",
  },
  awaiting_turn: {
    title: "It isn't your turn yet",
    body: "Someone ahead of you is still signing. You'll be emailed the moment it's your turn.",
  },
  already_signed: {
    title: "You've already signed",
    body: "Your signature is recorded. The sender gets the completed copy once everyone has signed.",
  },
};

export function Sign() {
  const { token } = useParams();
  const [view, setView] = useState<SignerView | null>(null);
  const [denial, setDenial] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ completed: boolean; remaining: number } | null>(null);

  useEffect(() => {
    api
      .signerView(token!)
      .then(setView)
      .catch((e) => setDenial(e.code ?? "not_found"));
  }, [token]);

  if (denial) {
    const d = DENIAL[denial] ?? DENIAL.not_found!;
    return (
      <>
        <div className="field" />
        <div className="banner">
          <Logo size={40} />
          <h1>{d.title}</h1>
          <p className="muted">{d.body}</p>
        </div>
      </>
    );
  }

  if (done) {
    return (
      <SignerShell step={3} title="All done">
        <div className="card center" style={{ maxWidth: 540, margin: "40px auto", padding: 40 }}>
          <div style={{ fontSize: 46, color: "var(--good)", lineHeight: 1 }}>✓</div>
          <h2 style={{ marginTop: 16, fontSize: 21 }}>Your signature is recorded</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            {done.completed
              ? "Everyone has now signed. The completed document, with its certificate page, has gone back to the sender."
              : `Thanks. ${done.remaining} more signer${done.remaining === 1 ? "" : "s"} to go — we've let the next one know it's their turn.`}
          </p>
          <p className="dim" style={{ fontSize: 12.5, marginTop: 20 }}>
            You can close this tab. This link no longer opens the document.
          </p>
        </div>
      </SignerShell>
    );
  }

  if (!view) {
    return (
      <SignerShell step={1} title="Loading…">
        <p className="muted">Fetching your document…</p>
      </SignerShell>
    );
  }

  const submit = async () => {
    if (!sig) return;
    setSubmitting(true);
    try {
      const r = await api.submit(token!, sig);
      setDone({ completed: r.completed, remaining: r.remaining });
    } catch (e: any) {
      setDenial(e.code ?? "not_found");
    }
  };

  return (
    <SignerShell step={sig ? 3 : 2} title={view.title}>
      <div className="note">
        <strong>{view.requester}</strong> asked you to sign this
        {view.expiresAt ? ` by ${fmtDate(view.expiresAt)}` : ""}. Click each{" "}
        <strong>Sign Here</strong> box to place your signature.
      </div>

      <div className="topline" style={{ marginBottom: 14 }}>
        <span className="muted">
          Signing as <strong style={{ color: "var(--ink)" }}>{view.signer.name}</strong>
        </span>
        <button className="btn-primary" disabled={!sig || submitting} onClick={submit}>
          {submitting ? "Submitting…" : "Finish and submit"}
        </button>
      </div>

      <div className="viewer">
        <PdfPages
          url={signerFileUrl(token!)}
          overlay={(p) =>
            view.fields
              .filter((f) => f.page === p.index)
              .map((f) => (
                <div
                  key={f.id}
                  className={`field-tab ${sig ? "filled" : ""}`}
                  style={{
                    left: f.x * p.width,
                    top: f.y * p.height,
                    width: f.w * p.width,
                    height: f.h * p.height,
                  }}
                  onClick={() => !sig && setModal(true)}
                  role={sig ? undefined : "button"}
                  tabIndex={sig ? -1 : 0}
                  onKeyDown={(e) => e.key === "Enter" && !sig && setModal(true)}
                >
                  {sig ? <img src={sig} alt="Your signature" /> : "[Sign Here]"}
                </div>
              ))
          }
        />
      </div>

      {modal && (
        <AdoptSignature
          name={view.signer.name}
          onClose={() => setModal(false)}
          onAdopt={(png) => {
            setSig(png);
            setModal(false);
          }}
        />
      )}
    </SignerShell>
  );
}
