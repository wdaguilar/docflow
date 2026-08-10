import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { useAuth } from "../lib/auth";

export function Login({ mode }: { mode: "login" | "signup" }) {
  const { user, ready, login, signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const location = useLocation();

  if (ready && user) {
    const to = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={to} replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") await signup(name, email, password);
      else await login(email, password);
      nav("/", { replace: true });
    } catch (err: any) {
      setError(err.friendly ?? "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <>
      <div className="field" />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <div style={{ width: "min(400px, 100%)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              justifyContent: "center",
              marginBottom: 26,
            }}
          >
            <Logo size={34} />
            <span className="brand-name" style={{ fontSize: 25 }}>
              DocFlow
            </span>
          </div>

          <div className="card">
            <h1 style={{ fontSize: 21, marginBottom: 4 }}>
              {isSignup ? "Create your account" : "Sign in"}
            </h1>
            <p className="sub" style={{ marginBottom: 20, fontSize: 13.5 }}>
              {isSignup
                ? "Send documents for signature and track them in one place."
                : "Welcome back."}
            </p>

            {error && (
              <div
                style={{
                  background: "rgba(239,68,68,.12)",
                  border: "1px solid rgba(239,68,68,.4)",
                  color: "#fca5a5",
                  borderRadius: 8,
                  padding: "11px 13px",
                  fontSize: 13.5,
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={submit}>
              {isSignup && (
                <div style={{ marginBottom: 14 }}>
                  <label className="f" htmlFor="name">
                    Your name
                  </label>
                  <input
                    id="name"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Rivera"
                    autoComplete="name"
                    required
                  />
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label className="f" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="f" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? "At least 8 characters" : ""}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  required
                />
              </div>

              <button className="btn-primary" style={{ width: "100%" }} disabled={busy}>
                {busy ? "Just a moment…" : isSignup ? "Create account" : "Sign in"}
              </button>
            </form>

            <p className="dim" style={{ fontSize: 13, marginTop: 18, marginBottom: 0 }}>
              {isSignup ? "Already have an account? " : "New here? "}
              <a
                href={isSignup ? "/login" : "/signup"}
                style={{ color: "var(--blue-hi)", fontWeight: 600 }}
              >
                {isSignup ? "Sign in" : "Create one"}
              </a>
            </p>
          </div>

          <p className="dim center" style={{ fontSize: 12.5, marginTop: 18 }}>
            Signing a document sent to you never requires an account.
          </p>
        </div>
      </div>
    </>
  );
}
