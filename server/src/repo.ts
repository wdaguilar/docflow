import { db, FILES_DIR, type AuditRow, type DocumentRow, type FieldRow, type SignerRow } from "./db";
import { newId } from "./lib/tokens";
import { join } from "node:path";

export const filePath = (name: string) => join(FILES_DIR, name);

export const getDocument = (id: string) =>
  db.query<DocumentRow, [string]>("SELECT * FROM documents WHERE id = ?").get(id);

export const listDocuments = (ownerEmail: string) =>
  db
    .query<DocumentRow, [string]>(
      "SELECT * FROM documents WHERE owner_email = ? ORDER BY updated_at DESC",
    )
    .all(ownerEmail);

export const getSigners = (documentId: string) =>
  db
    .query<SignerRow, [string]>(
      "SELECT * FROM signers WHERE document_id = ? ORDER BY order_index",
    )
    .all(documentId);

export const getSignerByToken = (token: string) =>
  db.query<SignerRow, [string]>("SELECT * FROM signers WHERE token = ?").get(token);

export const getFields = (documentId: string) =>
  db
    .query<FieldRow, [string]>("SELECT * FROM fields WHERE document_id = ?")
    .all(documentId);

export const getFieldsForSigner = (signerId: string) =>
  db
    .query<FieldRow, [string]>("SELECT * FROM fields WHERE signer_id = ?")
    .all(signerId);

export const getAudit = (documentId: string) =>
  db
    .query<AuditRow, [string]>(
      "SELECT * FROM audit_events WHERE document_id = ? ORDER BY at ASC",
    )
    .all(documentId);

export function recordEvent(e: {
  documentId: string;
  actor: string;
  action: string;
  detail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  db.query(
    `INSERT INTO audit_events (id, document_id, actor, action, detail, ip, user_agent, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    e.documentId,
    e.actor,
    e.action,
    e.detail ?? null,
    e.ip ?? null,
    e.userAgent ?? null,
    Date.now(),
  );
}

export function touch(documentId: string, status?: string) {
  if (status) {
    db.query("UPDATE documents SET status = ?, updated_at = ? WHERE id = ?").run(
      status,
      Date.now(),
      documentId,
    );
  } else {
    db.query("UPDATE documents SET updated_at = ? WHERE id = ?").run(
      Date.now(),
      documentId,
    );
  }
}

/** Shape sent to the dashboard. */
export function summarise(doc: DocumentRow) {
  const signers = getSigners(doc.id);
  return {
    id: doc.id,
    title: doc.title,
    status: doc.status,
    mode: doc.mode,
    recipients: signers.length,
    signedCount: signers.filter((s) => s.status === "signed").length,
    expiresAt: doc.expires_at,
    updatedAt: doc.updated_at,
    createdAt: doc.created_at,
    pageCount: doc.page_count,
    fingerprint: doc.final_sha256,
    signers: signers.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      status: s.status,
      order: s.order_index,
      signedAt: s.signed_at,
      // The requester can copy a signing link straight out of the dashboard —
      // this is the delivery path that works with no mail credentials.
      link: s.status === "signed" ? null : `/sign/${s.token}`,
    })),
  };
}
