import { NavLink } from "react-router-dom";
import { Logo } from "./Logo";
import { GridIcon, FileIcon, SendIcon, ShieldIcon } from "./Icons";

const nav = [
  { to: "/", label: "Dashboard", icon: <GridIcon />, end: true },
  { to: "/new", label: "New Request", icon: <FileIcon /> },
  { to: "/sent", label: "Sent Documents", icon: <SendIcon /> },
  { to: "/verify", label: "Verify", icon: <ShieldIcon /> },
];

export function Shell({ children }: { children: React.ReactNode }) {
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
            Signed in as
            <br />
            <strong style={{ color: "var(--muted)" }}>alex@docflow.app</strong>
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
