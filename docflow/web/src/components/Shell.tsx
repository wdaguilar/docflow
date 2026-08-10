import { NavLink, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { GridIcon, FileIcon, SendIcon, ShieldIcon, InboxIcon } from "./Icons";
import { useAuth } from "../lib/auth";

const nav = [
  { to: "/", label: "Dashboard", icon: <GridIcon />, end: true },
  { to: "/inbox", label: "Need Your Signature", icon: <InboxIcon /> },
  { to: "/new", label: "New Request", icon: <FileIcon /> },
  { to: "/sent", label: "Sent Documents", icon: <SendIcon /> },
  { to: "/verify", label: "Verify", icon: <ShieldIcon /> },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const nav_ = useNavigate();
  return (
    <>
      <div className="field" />
      <div className="shell">
        <aside className="rail">
          <div className="brand">
            <Logo />
            <span className="brand-name">DocFlow</span>
          </div>
          <nav className="nav">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `nav-item ${isActive ? "on" : ""}`}
              >
                {n.icon}
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="rail-foot">
            <div style={{ marginBottom: 8 }}>
              Signed in as
              <br />
              <strong style={{ color: "var(--muted)" }}>{user?.name ?? "…"}</strong>
              <br />
              <span style={{ fontSize: 11.5 }}>{user?.email}</span>
            </div>
            <button
              className="mini"
              style={{ background: "transparent", color: "var(--dim)", borderColor: "var(--line)" }}
              onClick={async () => {
                await logout();
                nav_("/login", { replace: true });
              }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </>
  );
}

/** The signer sees the same chrome with a progress rail instead of navigation. */
export function SignerShell({
  step,
  children,
  title,
}: {
  step: 1 | 2 | 3;
  title: string;
  children: React.ReactNode;
}) {
  const steps = ["Review Document", "Adopt Signature", "Finish"];
  return (
    <>
      <div className="field" />
      <div className="shell">
        <aside className="rail">
          <div className="brand">
            <Logo />
            <span className="brand-name">DocFlow</span>
          </div>
          <div className="stepper">
            {steps.map((label, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "now" : "";
              return (
                <div key={label} className={`step ${state} ${i < 2 ? "step-link" : ""}`}>
                  <span className="step-dot">{n < step ? "✓" : n}</span>
                  {label}
                </div>
              );
            })}
          </div>
          <div className="rail-foot">Secured by DocFlow · audit trail on</div>
        </aside>
        <main className="main">
          <div className="topline">
            <h1 style={{ fontSize: 27 }}>{title}</h1>
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
