# DocFlow

An e-signing application. Upload a PDF, place signature boxes on it, send it to
one or more signers, and get the executed copy back with a certificate page and
a tamper-evident fingerprint.

**Live URL:** _add your deployed URL here_

---

## The core flow

1. **Upload & request** — the requester drops in a PDF, adds signers, and clicks
   the page wherever a signature belongs. Boxes are colour-coded per signer.
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
| **Accounts** | Requesters sign up and own their documents. Signers never need one — a link is enough. |
| **"Documents you need to sign" inbox** | Anything sent to your email address appears here once you have an account, including documents sent before you registered. |
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

## The account model

Signing **never** requires an account. A signing link is a capability token, and
that is a deliberate product decision rather than a shortcut: every step placed
in front of a signature costs completion rate, which is why DocuSign, Dropbox
Sign, and Adobe Sign all let signers sign as guests.

Accounts exist for two other reasons:

- a **requester** needs to own their documents, so `/api/documents` is scoped to
  the signed-in user and every document route checks ownership;
- anyone who *does* have an account sees everything waiting on them in one place,
  matched on email address.

The two paths meet without colliding. Sign by link today, register next month,
and the history is already in your inbox — same token underneath, second way in.

Passwords are hashed with `Bun.password` (argon2id, no dependency). Sessions are
opaque 32-character tokens in an httpOnly, SameSite=Lax cookie, `secure` in
production, expiring after 30 days. Login returns the same message and does
comparable work for a wrong password and an unknown address, so the endpoint
cannot be used to discover which emails have accounts.

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

Then populate the dashboard with sample documents in every state:

```bash
bun run seed
```

That creates the demo account and signs you in with:

```
alex@docflow.app / docflow-demo-2026
```

It also leaves one document waiting in that account's own inbox, so both sides
of the product are visible immediately.

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
| `OWNER_EMAIL` | `alex@docflow.app` | Email used for the seeded demo account |
| `SEED_PASSWORD` | `docflow-demo-2026` | Password for the seeded demo account |
| `RESEND_API_KEY` | _unset_ | Enables real email; without it, mail is logged and links stay available in the dashboard |
| `MAIL_FROM` | `DocFlow <onboarding@resend.dev>` | Sender address |

## Tests

```bash
bun test          # from the repo root, or: cd server && bun test
```

Take a backup at any time:

```bash
bun run backup            # writes to ./server/data/backups/<timestamp>
bun run backup /some/path # or somewhere else
```

133 tests — 115 on the server, 18 on the frontend. They target the logic that is genuinely easy to get
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
- **`auth.test.ts`** — email normalisation, password policy including the 72-byte
  hashing limit counted in bytes rather than characters, and session expiry
  boundaries.
- **`recipients.test.ts`** — the send payload: signer emails, duplicate
  recipients, boxes pointing at absent signers or non-existent pages, signers
  with nowhere to sign, and expiry bounds.
- **`web/tests/validate.test.ts`** — the client-side index remap (see below),
  covering blank rows at the start, middle, and end of the signer list.
- **`ratelimit.test.ts`** — window boundaries, per-key isolation so one attacker
  cannot lock out everyone else, counter reset on a correct password, and bucket
  sweeping so the limiter cannot grow without bound.
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

## Security posture

Reviewed deliberately, with the fixes below covered by tests.

| Area | Position |
| --- | --- |
| **Secrets** | Nothing committed. `RESEND_API_KEY` and all config come from the environment; `.env` is gitignored. The seed script refuses to run in production with its published default password. |
| **Access control** | Every document route checks ownership against the session. Signing tokens pass through one `checkAccess` gate covering expiry, voiding, turn order, and reuse — applied to the PDF download as well as the metadata, so a spent token cannot still fetch the file. |
| **Server validation** | Every client-side rule is re-applied server-side: signer emails, duplicates, expiry bounds, field-to-signer mapping, page ranges, and box geometry. Uploads are checked by magic bytes, not extension. |
| **Rate limits** | Login, sign-up, signing-token access, uploads, and verification. Login is keyed on IP *and* account together, so an attacker cannot lock a real user out of their own account. A correct password clears the counter. |
| **Error messages** | 500s return `server_error` and nothing else; the detail goes to the server log. Login returns identical responses for a wrong password and an unknown address. |
| **Dependencies** | Six direct dependencies, all mainstream. `bun audit` reports no known vulnerabilities. |
| **Backups** | `bun run backup` takes a consistent snapshot via SQLite `VACUUM INTO` plus every stored PDF. This is a manual step and the honest gap — see below. |

### Known limitations

- **Rate limiting is per-process.** Correct for the current single-machine
  deployment; behind multiple replicas it would need shared state such as Redis.
- **Backups are manual.** The script exists and works, but nothing schedules it
  or ships the output off the machine. For anything real, that means a cron job
  writing to object storage — a backup on the same volume does not survive the
  failure it exists to protect against.
- **No password reset**, so a forgotten password means a new account.
- **The fingerprint proves integrity, not identity.** It shows the file is
  unaltered since DocFlow issued it; binding a certified identity to a signature
  means PAdES, which is a different piece of work.

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

**Validation runs twice, and the server decides.** The browser checks the same
rules for fast feedback, but every rule is re-applied server-side: a signature
box must point at a real signer, sit on a page that exists, and fall inside that
page; every signer must have somewhere to sign, or they would receive a link to
a document they cannot complete; expiry is bounded, because the input's `min`
attribute is trivially bypassed.

**Signature boxes are remapped when signers are removed.** Boxes hold the
*position* of their signer in the list. Drop a blank row from the middle and
every position after it shifts, so a box that read "signer 2" now points at
someone else — or at nobody. `prepareSend` rebuilds that mapping before sending,
discards boxes belonging to removed rows, and the server rejects any index that
still doesn't resolve. This was a real bug found while auditing the forms; the
tests for it name the scenario directly.

**Incremental stamping.** Each signature is burned into a working copy, so signer
two sees signer one's mark in place rather than an empty box.

## What I would build next

- Password reset by email, and optional two-factor for requesters.
- Reusable templates with saved field positions.
- Webhooks on document completion.
- Cryptographic PDF signatures (PAdES) rather than an image plus an external
  hash. The current fingerprint proves the file is unaltered; it does not bind an
  identity certificate to it.
- Move blob storage to S3/R2 and the database to Postgres for horizontal scaling.
