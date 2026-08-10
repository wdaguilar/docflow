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

/**
 * Documents waiting on this person as a signer, matched by email. This is what
 * makes an account useful to a signer without ever being required of them: sign
 * by link now, register later, and the history is already there.
 */
export function listInbox(email: string) {
  const rows = db
    .query<SignerRow & { doc_title: string; doc_status: string; owner: string; expires: number | null; updated: number }, [string]>(
      `SELECT s.*, d.title AS doc_title, d.status AS doc_status,
              d.owner_email AS owner, d.expires_at AS expires, d.updated_at AS updated
         FROM signers s
         JOIN documents d ON d.id = s.document_id
        WHERE s.email = ? AND d.status != 'voided'
        ORDER BY d.updated_at DESC`,
    )
    .all(email.toLowerCase());

  return rows.map((r) => ({
    documentId: r.document_id,
    title: r.doc_title,
    requester: r.owner,
    documentStatus: r.doc_status,
    myStatus: r.status,
    signedAt: r.signed_at,
    expiresAt: r.expires,
    updatedAt: r.updated,
    // Only handed out while the signature is actually due.
    link: r.status === "active" ? `/sign/${r.token}` : null,
  }));
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
