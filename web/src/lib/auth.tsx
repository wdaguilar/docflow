import { createContext, useContext, useEffect, useState } from "react";
import { api, type User } from "./api";

interface AuthState {
  user: User | null;
  /** Distinguishes "not logged in" from "we don't know yet". */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const value: AuthState = {
    user,
    ready,
    login: async (email, password) => setUser((await api.login(email, password)).user),
    signup: async (name, email, password) =>
      setUser((await api.signup(name, email, password)).user),
    logout: async () => {
      await api.logout();
      setUser(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
