# DocFlow

An e-signing application. Upload a PDF, place signature boxes on it, send it to
one or more signers, and get the executed copy back with a certificate page and
a tamper-evident fingerprint.

**Live URL:** [DocFlow](https://docflow-production-83f4.up.railway.app)

---

## The core flow

1. **Upload & request** — the requester drops in a PDF, adds signers, and clicks
   the page wherever a signature belongs. Boxes are color-coded per signer.
2. **Sign** — each signer opens their own link, reviews the document, adopts a
   signature (typed in script, or drawn), and submits.
3. **Return** — when the last signature lands, DocFlow binds a certificate page
   onto the document, fingerprints it, emails the requester, and makes it
   downloadable from the dashboard.

Delivery back to the requester works through three independent paths, so the
demo never depends on mail credentials being configured:

- the **dashboard**, which polls and updates live,
- a **direct download** of the signed PDF,
- an **email** with the download link (when `RESEND_API_KEY` is set).

## Beyond the core flow

| Feature | What it does |
| --- | --- |
| **Multi-signer workflows** | Sequential (one at a time, with the baton passed automatically) or parallel (everyone at once). |
| **Audit trail** | Every upload, open, signature, and notification is logged with timestamp, actor, IP, and user agent. |
| **Certificate of completion** | The audit trail is rendered as PDF pages and bound onto the signed document, so the proof travels with the file. |
| **Signature verification** | The finished PDF is hashed with SHA-256. `/verify` accepts any PDF and reports whether it is byte-identical to what DocFlow issued. |
| **Document expiration** | Links stop working after a configurable number of days. |
| **Status tracking** | Draft → Waiting for Others → Signed, with a per-signer breakdown. |
| **Reminders** | One click re-notifies whoever is currently holding things up. |
| **Void** | Cancel an in-flight request; every outstanding link dies immediately. |
| **Drag-and-drop placement** | Click anywhere on a rendered page to drop a box; click a box to remove it. |
| **Email notifications** | Invitation, your-turn, reminder, and completion mails via Resend. |

## Tech stack

- **Backend** — [Elysia](https://elysiajs.com) on [Bun](https://bun.sh), with
  `bun:sqlite` for storage and [pdf-lib](https://pdf-lib.js.org) for PDF work.
- **Frontend** — Vite + React + TypeScript, with `pdfjs-dist` rendering pages to
  canvas. Hand-written CSS, no UI framework.
- **Tests** — `bun test`, run on every push via GitHub Actions.
- **Deployment** — a single Docker image. Elysia serves both the API and the
  built SPA, so there is one origin, no CORS in production, and one thing to
  deploy.

## Running locally

```bash
bun run setup        # install both packages

bun run dev:server   # http://localhost:3000
bun run dev:web      # http://localhost:5173  (proxies /api to :3000)
```

Then, optionally, populate the dashboard with sample documents in every state:

```bash
bun run seed
```

Production mode — one process serving everything on `:3000`:

```bash
bun run build && bun run start
```

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | SQLite file and stored PDFs |
| `PUBLIC_URL` | `http://localhost:5173` | Origin used to build signing links in emails |
| `OWNER_EMAIL` | `alex@docflow.app` | The demo requester account |
| `RESEND_API_KEY` | _unset_ | Enables real email; without it, mail is logged and links stay available in the dashboard |
| `MAIL_FROM` | `DocFlow <onboarding@resend.dev>` | Sender address |

## Tests

```bash
bun test          # from the repo root, or: cd server && bun test
```

55 tests across five files. They target the logic that is genuinely easy to get
wrong rather than the framework:

- **`coords.test.ts`** — the top-left-to-bottom-left flip between browser and PDF
  coordinate space, round-tripping, aspect-preserving fit, and rejection of
  out-of-bounds rectangles. This is the bug that silently puts signatures in the
  wrong place, so it gets the most coverage.
- **`workflow.test.ts`** — the signing state machine: turn order, idempotent
  reconciliation, queue-jumping, duplicate submissions, and completion in both
  sequential and parallel modes.
- **`access.test.ts`** — token entropy and URL-safety, plus the access check that
  decides whether a link opens right now, including expiry boundary conditions
  and precedence between denial reasons.
- **`verify.test.ts`** — hashing, fingerprint formatting, and rejection of a
  truncated digest (so verification can't be passed with a prefix).
- **`pdf.test.ts`** — real PDFs built in-memory, stamped, and re-parsed:
  page counts survive, repeat stamping works as sequential signing requires, and
  the certificate page overflows correctly on a long audit trail.

CI runs the suite, typechecks the server, and builds the frontend on every push
and pull request — see `.github/workflows/ci.yml`.

## Deploying

The image builds the frontend and serves it from the Bun process.

```bash
fly launch --no-deploy
fly volumes create docflow_data --size 1
fly secrets set PUBLIC_URL=https://your-app.fly.dev RESEND_API_KEY=...
fly deploy
```

The volume matters: without it, SQLite and the stored PDFs are wiped on every
redeploy. Any host that runs a Dockerfile with a persistent disk works the same
way — Railway, Render, or a plain VPS.

## Design notes

**Field coordinates are normalised, not pixels.** A box is stored as four floats
in `0..1` relative to its page. Zoom level, device pixel ratio, and page size all
drop out of the maths, and the browser-to-PDF origin flip lives in exactly one
function (`toPdfRect`) that is heavily tested.

**Signing links are capability tokens, not accounts.** A signer is identified by
138 bits of entropy in the URL. This is how the real products work, and it means
a signer never registers for anything. The token alphabet excludes `I`, `l`, `O`,
`O`, and `U` so a link can survive being read aloud.

**The state machine is pure and idempotent.** `reconcile()` recomputes every
signer's status from scratch, so a retried request or a double-submitted form
can never advance the queue twice. The HTTP layer holds no workflow logic.

**Signatures are always images.** Typed signatures are rendered to a transparent
canvas in the browser using the same script face shown in the preview, so both
tabs produce a PNG and the server has one code path to embed.

**Incremental stamping.** Each signature is burned into a working copy, so signer
two sees signer one's mark in place rather than an empty box.

## What I would build next

- Real authentication for requesters — right now the dashboard is a single demo
  account, which is the honest limit of the current scope.
- Reusable templates with saved field positions.
- Webhooks on document completion.
- Cryptographic PDF signatures (PAdES) rather than an image plus an external
  hash. The current fingerprint proves the file is unaltered; it does not bind an
  identity certificate to it.
- Move blob storage to S3/R2 and the database to Postgres for horizontal scaling.
