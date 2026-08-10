export interface SignerSummary {
  id: string;
  name: string;
  email: string;
  status: "pending" | "active" | "signed";
  order: number;
  signedAt: number | null;
  link: string | null;
}

export interface DocSummary {
  id: string;
  title: string;
  status: "draft" | "awaiting_others" | "completed" | "voided";
  mode: "sequential" | "parallel";
  recipients: number;
  signedCount: number;
  expiresAt: number | null;
  updatedAt: number;
  createdAt: number;
  pageCount: number;
  fingerprint: string | null;
  signers: SignerSummary[];
}

export interface Field {
  id: string;
  signer_id: string;
  kind: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  detail: string | null;
  ip: string | null;
  at: number;
}

export interface DocDetail extends DocSummary {
  fields: Field[];
  audit: AuditEvent[];
}

export interface SignerView {
  documentId: string;
  title: string;
  pageCount: number;
  requester: string;
  expiresAt: number | null;
  signer: { name: string; email: string };
  fields: Field[];
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public friendly?: string,
  ) {
    super(friendly ?? code);
  }
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface InboxItem {
  documentId: string;
  title: string;
  requester: string;
  documentStatus: string;
  myStatus: "pending" | "active" | "signed";
  signedAt: number | null;
  expiresAt: number | null;
  updatedAt: number;
  link: string | null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  // Session lives in an httpOnly cookie, so every call must carry credentials.
  const res = await fetch(`/api${path}`, { credentials: "include", ...init });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok)
    throw new ApiError(data?.error ?? "request_failed", res.status, data?.message);
  return data as T;
}

export const api = {
  me: () => req<{ user: User | null }>("/auth/me"),

  signup: (name: string, email: string, password: string) =>
    req<{ user: User }>("/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    req<{ user: User }>("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),

  logout: () => req<{ ok: true }>("/auth/logout", { method: "POST" }),

  inbox: () => req<InboxItem[]>("/inbox"),

  list: () => req<DocSummary[]>("/documents"),
  get: (id: string) => req<DocDetail>(`/documents/${id}`),

  upload: (file: File, title: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title);
    return req<DocSummary>("/documents", { method: "POST", body: fd });
  },

  send: (
    id: string,
    payload: {
      mode: "sequential" | "parallel";
      expiresInDays?: number;
      signers: { name: string; email: string }[];
      fields: {
        signerIndex: number;
        page: number;
        x: number;
        y: number;
        w: number;
        h: number;
      }[];
    },
  ) =>
    req<DocSummary>(`/documents/${id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),

  remind: (id: string) =>
    req<{ reminded: number }>(`/documents/${id}/remind`, { method: "POST" }),

  void: (id: string) => req<DocSummary>(`/documents/${id}/void`, { method: "POST" }),

  signerView: (token: string) => req<SignerView>(`/sign/${token}`),

  submit: (token: string, signature: string) =>
    req<{ ok: boolean; completed: boolean; remaining: number }>(`/sign/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature, consent: true }),
    }),

  verifyById: (id: string) => req<any>(`/verify/${id}`),

  verifyFile: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<any>("/verify", { method: "POST", body: fd });
  },
};

export const fileUrl = (id: string) => `/api/documents/${id}/file`;
export const signerFileUrl = (token: string) => `/api/sign/${token}/file`;

export const fmtDate = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
