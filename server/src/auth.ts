import { Elysia, t } from "elysia";
import { db, type SessionRow, type UserRow } from "./db";
import { newId, newToken } from "./lib/tokens";
import { RateLimiter, LOGIN_RULE, SIGNUP_RULE } from "./lib/ratelimit";
import {
  EMAIL_HELP,
  PASSWORD_HELP,
  normaliseEmail,
  sessionExpiry,
  sessionIsLive,
  validateEmail,
  validatePassword,
} from "./lib/auth";

const COOKIE = "docflow_session";
const PROD = process.env.NODE_ENV === "production";

const loginLimiter = new RateLimiter(LOGIN_RULE);
const signupLimiter = new RateLimiter(SIGNUP_RULE);

setInterval(() => {
  loginLimiter.sweep();
  signupLimiter.sweep();
  // Lapsed sessions are rows nobody will ever read again.
  db.query("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}, 300_000).unref?.();

const clientKey = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export const getUserByEmail = (email: string) =>
  db.query<UserRow, [string]>("SELECT * FROM users WHERE email = ?").get(email);

export const getUserById = (id: string) =>
  db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ?").get(id);

/** Resolve a session cookie to a user, dropping it if it has lapsed. */
export function userFromSession(sessionId: string | undefined): UserRow | null {
  if (!sessionId) return null;
  const session = db
    .query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId);
  if (!session) return null;
  if (!sessionIsLive(session.expires_at)) {
    db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }
  return getUserById(session.user_id) ?? null;
}

function createSession(userId: string, userAgent: string | null): { id: string; expiresAt: number } {
  const id = newToken(32);
  const expiresAt = sessionExpiry();
  db.query(
    "INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent) VALUES (?,?,?,?,?)",
  ).run(id, userId, expiresAt, Date.now(), userAgent);
  return { id, expiresAt };
}

const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name });

const cookieOptions = (expiresAt: number) => ({
  httpOnly: true,
  secure: PROD,
  sameSite: "lax" as const,
  path: "/",
  expires: new Date(expiresAt),
});

/**
 * Derives the current user for every request. Mounted before the routes that
 * need it, so handlers just read `user` instead of re-parsing cookies.
 */
export const authContext = new Elysia({ name: "auth-context" }).derive(
  { as: "global" },
  ({ cookie }) => ({ user: userFromSession(cookie[COOKIE]?.value as string | undefined) }),
);

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(authContext)

  .get("/me", ({ user }) => (user ? { user: publicUser(user) } : { user: null }))

  .post(
    "/signup",
    async ({ body, cookie, set, request }) => {
      const gate = signupLimiter.check(clientKey(request));
      if (!gate.allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(gate.retryAfterMs / 1000));
        return {
          error: "rate_limited",
          message: "Too many sign-up attempts. Try again in a little while.",
        };
      }

      const email = normaliseEmail(body.email);

      const emailProblem = validateEmail(email);
      if (emailProblem !== "ok") {
        set.status = 400;
        return { error: "invalid_email", message: EMAIL_HELP[emailProblem] };
      }

      const pwProblem = validatePassword(body.password);
      if (pwProblem !== "ok") {
        set.status = 400;
        return { error: "invalid_password", message: PASSWORD_HELP[pwProblem] };
      }

      if (getUserByEmail(email)) {
        set.status = 409;
        return {
          error: "email_taken",
          message: "An account already uses that email. Sign in instead.",
        };
      }

      const id = newId();
      // Bun's default is argon2id — no bcrypt dependency needed.
      const hash = await Bun.password.hash(body.password);
      db.query(
        "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)",
      ).run(id, email, body.name.trim() || email.split("@")[0]!, hash, Date.now());

      // Any documents already sent to this address now surface in their inbox,
      // so someone who signed via a link before registering keeps their history.
      const session = createSession(id, request.headers.get("user-agent"));
      cookie[COOKIE]?.set({ value: session.id, ...cookieOptions(session.expiresAt) });

      set.status = 201;
      return { user: publicUser(getUserById(id)!) };
    },
    {
      body: t.Object({
        name: t.String(),
        email: t.String(),
        password: t.String(),
      }),
    },
  )

  .post(
    "/login",
    async ({ body, cookie, set, request }) => {
      // Keyed on IP and account together, so one attacker cannot lock a
      // legitimate user out of their own account by failing on their behalf.
      const ip = clientKey(request);
      const email = normaliseEmail(body.email);
      const gate = loginLimiter.check(`${ip}:${email}`);
      if (!gate.allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(gate.retryAfterMs / 1000));
        return {
          error: "rate_limited",
          message: "Too many attempts. Try again in a few minutes.",
        };
      }

      const user = getUserByEmail(email);

      // Same message and comparable work either way, so the response can't be
      // used to discover which addresses have accounts.
      const ok = user
        ? await Bun.password.verify(body.password, user.password_hash)
        : await Bun.password.verify(body.password, await Bun.password.hash("decoy"));

      if (!user || !ok) {
        set.status = 401;
        return {
          error: "bad_credentials",
          message: "That email and password don't match an account.",
        };
      }

      // A correct password clears the failure count for this pair.
      loginLimiter.reset(`${ip}:${email}`);

      const session = createSession(user.id, request.headers.get("user-agent"));
      cookie[COOKIE]?.set({ value: session.id, ...cookieOptions(session.expiresAt) });
      return { user: publicUser(user) };
    },
    { body: t.Object({ email: t.String(), password: t.String() }) },
  )

  .post("/logout", ({ cookie }) => {
    const id = cookie[COOKIE]?.value as string | undefined;
    if (id) db.query("DELETE FROM sessions WHERE id = ?").run(id);
    cookie[COOKIE]?.remove();
    return { ok: true };
  });

export { COOKIE };
