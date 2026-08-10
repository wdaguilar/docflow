import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NewRequest } from "./pages/NewRequest";
import { DocumentDetail } from "./pages/DocumentDetail";
import { Sign } from "./pages/Sign";
import { Verify } from "./pages/Verify";
import { Inbox } from "./pages/Inbox";
import { Login } from "./pages/Login";
import { AuthProvider, useAuth } from "./lib/auth";

/** Sends anonymous visitors to sign in, remembering where they were headed. */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <>
        <div className="field" />
        <p className="muted center" style={{ marginTop: "42vh" }}>
          Loading…
        </p>
      </>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Signing needs no account — this is the whole point of the token link. */}
          <Route path="/sign/:token" element={<Sign />} />
          <Route path="/login" element={<Login mode="login" />} />
          <Route path="/signup" element={<Login mode="signup" />} />

          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/inbox" element={<Protected><Inbox /></Protected>} />
          <Route path="/sent" element={<Protected><Dashboard onlySent /></Protected>} />
          <Route path="/new" element={<Protected><NewRequest /></Protected>} />
          <Route path="/documents/:id" element={<Protected><DocumentDetail /></Protected>} />
          <Route path="/verify" element={<Protected><Verify /></Protected>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
