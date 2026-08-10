import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? "./data";
export const FILES_DIR = join(DATA_DIR, "files");

mkdirSync(FILES_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, "docflow.sqlite"), {
  create: true,
});

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  owner_email   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft',
  mode          TEXT NOT NULL DEFAULT 'sequential',
  original_path TEXT NOT NULL,
  working_path  TEXT,
  final_path    TEXT,
  final_sha256  TEXT,
  page_count    INTEGER NOT NULL DEFAULT 1,
  expires_at    INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signers (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  order_index INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  signed_at   INTEGER,
  signed_ip   TEXT,
  user_agent  TEXT,
  consent     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fields (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signer_id   TEXT NOT NULL REFERENCES signers(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'signature',
  page        INTEGER NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail      TEXT,
  ip          TEXT,
  user_agent  TEXT,
  at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signers_doc ON signers(document_id);
CREATE INDEX IF NOT EXISTS idx_fields_doc ON fields(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_doc ON audit_events(document_id, at);
`);

export interface DocumentRow {
  id: string;
  title: string;
  owner_email: string;
  status: string;
  mode: "sequential" | "parallel";
  original_path: string;
  working_path: string | null;
  final_path: string | null;
  final_sha256: string | null;
  page_count: number;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface SignerRow {
  id: string;
  document_id: string;
  name: string;
  email: string;
  token: string;
  order_index: number;
  status: "pending" | "active" | "signed";
  signed_at: number | null;
  signed_ip: string | null;
  user_agent: string | null;
  consent: number;
}

export interface FieldRow {
  id: string;
  document_id: string;
  signer_id: string;
  kind: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AuditRow {
  id: string;
  document_id: string;
  actor: string;
  action: string;
  detail: string | null;
  ip: string | null;
  user_agent: string | null;
  at: number;
}
