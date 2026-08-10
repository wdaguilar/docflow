import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { authContext, authRoutes } from "./auth";
import { resolveExpiry, validateFields, validateSigners } from "./lib/recipients";
import { staticPlugin } from "@elysiajs/static";
import { existsSync } from "node:fs";
import { db } from "./db";
import * as repo from "./repo";
import { newId, newToken, checkAccess } from "./lib/tokens";
import { applySignature, reconcile, type Signer } from "./lib/workflow";
import { sha256, fingerprint, digestsMatch } from "./lib/hash";
import { appendCertificate, pageCount, stampSignatures } from "./lib/pdf";
import * as mail from "./lib/mailer";

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:5173`;
const MAX_UPLOAD = 15 * 1024 * 1024;

/** Owner of documents created before accounts existed, and of seeded demo data. */
const LEGACY_OWNER = process.env.OWNER_EMAIL ?? "alex@docflow.app";

const clientIp = (req: Request, server: { requestIP?: (r: Request) => { address: string } | null }) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  server.requestIP?.(req)?.address ??
  null;

const app = new Elysia()
  .use(cors({ credentials: true, origin: true }))
  .use(authRoutes)
  .use(authContext)
  .onError(({ code, error, set }) => {
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "not_found" };
    }
    console.error(error);
    set.status = set.status && Number(set.status) >= 400 ? set.status : 500;
    return { error: error instanceof Error ? error.message : "server_error" };
  })

  .get("/api/health", () => ({ ok: true, at: Date.now() }))

  // ── Requester ──────────────────────────────────────────────────────────
  .get("/api/documents", ({ user, set }) => {
    if (!user) return (set.status = 401), { error: "unauthenticated" };
    return repo.listDocuments(user.email).map(repo.summarise);
  })

  /** Documents waiting on the signed-in user, matched by email address. */
  .get("/api/inbox", ({ user, set }) => {
    if (!user) return (set.status = 401), { error: "unauthenticated" };
    return repo.listInbox(user.email);
  })

  .get("/api/documents/:id", ({ params, set, user }) => {
    const doc = repo.getDocument(params.id);
    if (!doc) return (set.status = 404), { error: "not_found" };
    if (!user || doc.owner_email !== user.email) {
      set.status = user ? 403 : 401;
      return { error: user ? "not_yours" : "unauthenticated" };
    }
    return {
      ...repo.summarise(doc),
      fields: repo.getFields(doc.id),
      audit: repo.getAudit(doc.id),
    };
  })

  /** Step 1 — upload. Creates a draft; no signers yet. */
  .post(
    "/api/documents",
    async ({ body, set, request, server, user }) => {
      if (!user) return (set.status = 401), { error: "unauthenticated" };
      const file = body.file;
      if (!file || file.size === 0) {
        set.status = 400;
        return { error: "file_required" };
      }
      if (file.size > MAX_UPLOAD) {
        set.status = 413;
        return { error: "file_too_large", limit: MAX_UPLOAD };
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
        set.status = 415;
        return { error: "not_a_pdf" };
      }

      const id = newId();
      const name = `${id}-original.pdf`;
      await Bun.write(repo.filePath(name), bytes);

      let pages = 1;
      try {
        pages = await pageCount(bytes);
      } catch {
        set.status = 422;
        return { error: "unreadable_pdf" };
      }

      const now = Date.now();
      db.query(
        `INSERT INTO documents (id,title,owner_email,status,mode,original_path,page_count,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        body.title?.trim() || file.name.replace(/\.pdf$/i, ""),
        user.email,
        "draft",
        "sequential",
        name,
        pages,
        now,
        now,
      );

      repo.recordEvent({
        documentId: id,
        actor: user.email,
        action: "Document uploaded",
        detail: `${file.name} · ${pages} page${pages === 1 ? "" : "s"}`,
        ip: clientIp(request, server as never),
        userAgent: request.headers.get("user-agent"),
      });

      set.status = 201;
      return repo.summarise(repo.getDocument(id)!);
    },
    {
      body: t.Object({
        file: t.File(),
        title: t.Optional(t.String()),
      }),
    },
  )

  /** Step 2 — add signers + placed fields, then send. */
  .post(
    "/api/documents/:id/send",
    async ({ params, body, set, request, server, user }) => {
      const doc = repo.getDocument(params.id);
      if (!doc) return (set.status = 404), { error: "not_found" };
      if (!user || doc.owner_email !== user.email) {
        set.status = user ? 403 : 401;
        return { error: user ? "not_yours" : "unauthenticated" };
      }
      if (doc.status !== "draft") {
        set.status = 409;
        return { error: "already_sent" };
      }

      const checkedSigners = validateSigners(body.signers);
      if (!checkedSigners.ok) {
        set.status = 400;
        return { error: checkedSigners.error, message: checkedSigners.message };
      }

      const checkedFields = validateFields(
        body.fields,
        checkedSigners.value.length,
        doc.page_count,
      );
      if (!checkedFields.ok) {
        set.status = 400;
        return { error: checkedFields.error, message: checkedFields.message };
      }

      const expiry = resolveExpiry(body.expiresInDays);
      if (!expiry.ok) {
        set.status = 400;
        return { error: expiry.error, message: expiry.message };
      }
      const expiresAt = expiry.value;

      const ip = clientIp(request, server as never);
      const ua = request.headers.get("user-agent");

      const tx = db.transaction(() => {
        const ids: string[] = [];
        checkedSigners.value.forEach((s, i) => {
          const sid = newId();
          ids.push(sid);
          db.query(
            `INSERT INTO signers (id,document_id,name,email,token,order_index,status)
             VALUES (?,?,?,?,?,?,?)`,
          ).run(sid, doc.id, s.name, s.email, newToken(), i, "pending");
        });

        for (const f of checkedFields.value) {
          const sid = ids[f.signerIndex]!;
          db.query(
            `INSERT INTO fields (id,document_id,signer_id,kind,page,x,y,w,h)
             VALUES (?,?,?,?,?,?,?,?,?)`,
          ).run(newId(), doc.id, sid, f.kind ?? "signature", f.page, f.x, f.y, f.w, f.h);
        }

        db.query(
          "UPDATE documents SET status=?, mode=?, expires_at=?, updated_at=? WHERE id=?",
        ).run(
          "awaiting_others",
          body.mode ?? "sequential",
          expiresAt,
          Date.now(),
          doc.id,
        );
      });
      tx();

      // Activate whoever goes first.
      const signers = repo.getSigners(doc.id);
      const mode = body.mode ?? "sequential";
      for (const s of reconcile(
        signers.map<Signer>((s) => ({ id: s.id, order: s.order_index, status: s.status })),
        mode,
      )) {
        db.query("UPDATE signers SET status=? WHERE id=?").run(s.status, s.id);
      }

      repo.recordEvent({
        documentId: doc.id,
        actor: user.email,
        action: "Sent for signature",
        detail: `${checkedSigners.value.length} recipient(s) · ${mode}`,
        ip,
        userAgent: ua,
      });

      const fresh = repo.getSigners(doc.id);
      for (const s of fresh.filter((s) => s.status === "active")) {
        const result = await mail.send({
          to: s.email,
          subject: `Signature requested: ${doc.title}`,
          html: mail.signatureRequest({
            signer: s.name,
            requester: doc.owner_email,
            title: doc.title,
            url: `${PUBLIC_URL}/sign/${s.token}`,
            expires: expiresAt,
          }),
        });
        repo.recordEvent({
          documentId: doc.id,
          actor: s.email,
          action: result.delivered ? "Invitation emailed" : "Invitation queued",
          detail: result.delivered ? null : `link available in dashboard (${result.reason})`,
        });
      }

      return repo.summarise(repo.getDocument(doc.id)!);
    },
    {
      body: t.Object({
        mode: t.Optional(t.Union([t.Literal("sequential"), t.Literal("parallel")])),
        expiresInDays: t.Optional(t.Number()),
        signers: t.Array(t.Object({ name: t.String(), email: t.String() })),
        fields: t.Array(
          t.Object({
            signerIndex: t.Number(),
            kind: t.Optional(t.String()),
            page: t.Number(),
            x: t.Number(),
            y: t.Number(),
            w: t.Number(),
            h: t.Number(),
          }),
        ),
      }),
    },
  )

  .post("/api/documents/:id/void", ({ params, set, user }) => {
    const doc = repo.getDocument(params.id);
    if (!doc) return (set.status = 404), { error: "not_found" };
    if (!user || doc.owner_email !== user.email) {
      set.status = user ? 403 : 401;
      return { error: user ? "not_yours" : "unauthenticated" };
    }
    if (doc.status === "completed") {
      set.status = 409;
      return { error: "already_completed" };
    }
    repo.touch(doc.id, "voided");
    repo.recordEvent({ documentId: doc.id, actor: user.email, action: "Document voided" });
    return repo.summarise(repo.getDocument(doc.id)!);
  })

  .post("/api/documents/:id/remind", async ({ params, set, user }) => {
    const doc = repo.getDocument(params.id);
    if (!doc) return (set.status = 404), { error: "not_found" };
    if (!user || doc.owner_email !== user.email) {
      set.status = user ? 403 : 401;
      return { error: user ? "not_yours" : "unauthenticated" };
    }
    const waiting = repo.getSigners(doc.id).filter((s) => s.status === "active");
    for (const s of waiting) {
      await mail.send({
        to: s.email,
        subject: `Reminder: ${doc.title} is waiting for you`,
        html: mail.signatureRequest({
          signer: s.name,
          requester: doc.owner_email,
          title: doc.title,
          url: `${PUBLIC_URL}/sign/${s.token}`,
          expires: doc.expires_at,
        }),
      });
    }
    repo.recordEvent({
      documentId: doc.id,
      actor: user.email,
      action: "Reminder sent",
      detail: waiting.map((s) => s.email).join(", ") || "no one is waiting",
    });
    return { reminded: waiting.length };
  })

  /** The requester's copy — signed if complete, original otherwise. */
  .get("/api/documents/:id/file", ({ params, set, user }) => {
    const doc = repo.getDocument(params.id);
    if (!doc) return (set.status = 404), { error: "not_found" };
    if (!user || doc.owner_email !== user.email) {
      set.status = user ? 403 : 401;
      return { error: user ? "not_yours" : "unauthenticated" };
    }
    const name = doc.final_path ?? doc.working_path ?? doc.original_path;
    const file = Bun.file(repo.filePath(name));
    set.headers["content-type"] = "application/pdf";
    set.headers["content-disposition"] =
      `inline; filename="${doc.title.replace(/["\\]/g, "")}.pdf"`;
    return file;
  })

  // ── Signer ─────────────────────────────────────────────────────────────
  .get("/api/sign/:token", ({ params, set, request, server }) => {
    const signer = repo.getSignerByToken(params.token);
    const doc = signer ? repo.getDocument(signer.document_id) : null;
    const verdict = checkAccess({
      signer: signer ? { status: signer.status } : null,
      document: doc ? { status: doc.status, expiresAt: doc.expires_at } : null,
    });

    if (verdict !== "ok") {
      set.status = verdict === "not_found" ? 404 : 403;
      return { error: verdict, title: doc?.title ?? null };
    }

    repo.recordEvent({
      documentId: doc!.id,
      actor: signer!.email,
      action: "Document opened",
      ip: clientIp(request, server as never),
      userAgent: request.headers.get("user-agent"),
    });

    return {
      documentId: doc!.id,
      title: doc!.title,
      pageCount: doc!.page_count,
      requester: doc!.owner_email,
      expiresAt: doc!.expires_at,
      signer: { name: signer!.name, email: signer!.email },
      fields: repo.getFieldsForSigner(signer!.id),
    };
  })

  .get("/api/sign/:token/file", ({ params, set }) => {
    const signer = repo.getSignerByToken(params.token);
    if (!signer) return (set.status = 404), { error: "not_found" };
    const doc = repo.getDocument(signer.document_id)!;
    // Signers see the running copy, so signature #2 sees signature #1 in place.
    const name = doc.working_path ?? doc.original_path;
    set.headers["content-type"] = "application/pdf";
    return Bun.file(repo.filePath(name));
  })

  .post(
    "/api/sign/:token",
    async ({ params, body, set, request, server }) => {
      const signer = repo.getSignerByToken(params.token);
      const doc = signer ? repo.getDocument(signer.document_id) : null;
      const verdict = checkAccess({
        signer: signer ? { status: signer.status } : null,
        document: doc ? { status: doc.status, expiresAt: doc.expires_at } : null,
      });
      if (verdict !== "ok") {
        set.status = verdict === "not_found" ? 404 : 403;
        return { error: verdict };
      }
      if (!body.consent) {
        set.status = 400;
        return { error: "consent_required" };
      }

      const b64 = body.signature.replace(/^data:image\/png;base64,/, "");
      const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

      const fields = repo.getFieldsForSigner(signer!.id);
      if (fields.length === 0) {
        set.status = 409;
        return { error: "no_fields_assigned" };
      }

      const sourceName = doc!.working_path ?? doc!.original_path;
      const source = new Uint8Array(
        await Bun.file(repo.filePath(sourceName)).arrayBuffer(),
      );
      const stamped = await stampSignatures(
        source,
        fields.map((field) => ({ field, png })),
      );

      const workingName = `${doc!.id}-working.pdf`;
      await Bun.write(repo.filePath(workingName), stamped);

      const ip = clientIp(request, server as never);
      const ua = request.headers.get("user-agent");
      const all = repo.getSigners(doc!.id);
      const result = applySignature(
        all.map<Signer>((s) => ({ id: s.id, order: s.order_index, status: s.status })),
        signer!.id,
        doc!.mode,
      );

      db.transaction(() => {
        for (const s of result.signers) {
          db.query("UPDATE signers SET status=? WHERE id=?").run(s.status, s.id);
        }
        db.query(
          "UPDATE signers SET signed_at=?, signed_ip=?, user_agent=?, consent=1 WHERE id=?",
        ).run(Date.now(), ip, ua, signer!.id);
        db.query(
          "UPDATE documents SET working_path=?, status=?, updated_at=? WHERE id=?",
        ).run(workingName, result.documentStatus, Date.now(), doc!.id);
      })();

      repo.recordEvent({
        documentId: doc!.id,
        actor: signer!.email,
        action: "Signature applied",
        detail: `${fields.length} field(s) · consent given`,
        ip,
        userAgent: ua,
      });

      // Hand the baton to whoever is next.
      for (const next of result.activated) {
        const row = repo.getSigners(doc!.id).find((s) => s.id === next.id)!;
        await mail.send({
          to: row.email,
          subject: `Your turn: ${doc!.title}`,
          html: mail.signatureRequest({
            signer: row.name,
            requester: doc!.owner_email,
            title: doc!.title,
            url: `${PUBLIC_URL}/sign/${row.token}`,
            expires: doc!.expires_at,
          }),
        });
        repo.recordEvent({
          documentId: doc!.id,
          actor: row.email,
          action: "Next signer notified",
        });
      }

      if (result.completed) {
        await finalise(doc!.id);
      }

      return {
        ok: true,
        completed: result.completed,
        remaining: result.signers.filter((s) => s.status !== "signed").length,
      };
    },
    {
      body: t.Object({
        signature: t.String({ minLength: 32 }),
        consent: t.Boolean(),
      }),
    },
  )

  // ── Verification ───────────────────────────────────────────────────────
  .get("/api/verify/:id", ({ params, set }) => {
    const doc = repo.getDocument(params.id);
    if (!doc || !doc.final_sha256) {
      set.status = 404;
      return { error: "no_completed_document" };
    }
    return {
      documentId: doc.id,
      title: doc.title,
      completedAt: doc.updated_at,
      sha256: doc.final_sha256,
      fingerprint: fingerprint(doc.final_sha256),
      signers: repo.getSigners(doc.id).map((s) => ({
        name: s.name,
        email: s.email,
        signedAt: s.signed_at,
      })),
    };
  })

  .post(
    "/api/verify",
    async ({ body, set }) => {
      const bytes = new Uint8Array(await body.file.arrayBuffer());
      const digest = await sha256(bytes);
      const match = db
        .query<{ id: string; title: string; final_sha256: string }, [string]>(
          "SELECT id, title, final_sha256 FROM documents WHERE final_sha256 = ?",
        )
        .get(digest);
      if (!match) {
        set.status = 404;
        return {
          verified: false,
          sha256: digest,
          message:
            "No DocFlow document matches this file. It was either altered after signing or produced elsewhere.",
        };
      }
      return {
        verified: true,
        documentId: match.id,
        title: match.title,
        sha256: digest,
        fingerprint: fingerprint(digest),
      };
    },
    { body: t.Object({ file: t.File() }) },
  );

/** Bind the certificate, fingerprint the result, tell the requester. */
async function finalise(documentId: string) {
  const doc = repo.getDocument(documentId)!;
  const working = new Uint8Array(
    await Bun.file(repo.filePath(doc.working_path!)).arrayBuffer(),
  );
  const signers = repo.getSigners(documentId);

  repo.recordEvent({
    documentId,
    actor: "docflow",
    action: "All signatures collected",
  });

  const final = await appendCertificate(working, {
    documentId,
    title: doc.title,
    events: repo.getAudit(documentId),
    signers: signers.map((s) => ({ name: s.name, email: s.email, signedAt: s.signed_at })),
  });

  const finalName = `${documentId}-signed.pdf`;
  await Bun.write(repo.filePath(finalName), final);
  const digest = await sha256(final);

  db.query(
    "UPDATE documents SET final_path=?, final_sha256=?, status=?, updated_at=? WHERE id=?",
  ).run(finalName, digest, "completed", Date.now(), documentId);

  repo.recordEvent({
    documentId,
    actor: "docflow",
    action: "Certificate issued",
    detail: `SHA-256 ${digest.slice(0, 32)}…`,
  });

  await mail.send({
    to: doc.owner_email,
    subject: `Signed: ${doc.title}`,
    html: mail.completed({
      title: doc.title,
      url: `${PUBLIC_URL}/documents/${documentId}`,
      digest,
    }),
  });
}

// ── Static frontend (single-service deploy) ──────────────────────────────
const DIST = "../web/dist";
if (existsSync(DIST)) {
  app.use(staticPlugin({ assets: DIST, prefix: "/" }));
  // SPA fallback: any non-API path renders the app shell.
  app.get("*", ({ path, set }) => {
    if (path.startsWith("/api")) {
      set.status = 404;
      return { error: "not_found" };
    }
    return Bun.file(`${DIST}/index.html`);
  });
}

app.listen(PORT);
console.log(`DocFlow API on http://localhost:${PORT}`);

export type App = typeof app;
export { app, finalise };
