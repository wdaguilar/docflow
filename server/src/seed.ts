/**
 * Populates a fresh install with believable documents so a reviewer opening the
 * live URL sees a working dashboard instead of an empty table.
 * Run with: bun src/seed.ts
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const API = process.env.SEED_API ?? "http://localhost:3000";
const DEMO_EMAIL = process.env.OWNER_EMAIL ?? "alex@docflow.app";
/* The default is a published credential — fine for a laptop, unacceptable on a
   public deployment, so production must supply its own. */
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "docflow-demo-2026";

if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) {
  console.error(
    "Refusing to seed production with the default demo password.\n" +
      "Set SEED_PASSWORD to something private first.",
  );
  process.exit(1);
}

/** Uploads require a session, so seeding signs in as the demo account first. */
let cookie = "";

async function authenticate() {
  const body = JSON.stringify({
    name: "Alex Rivera",
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  const headers = { "content-type": "application/json" };

  let res = await fetch(`${API}/api/auth/signup`, { method: "POST", headers, body });
  if (res.status === 409) {
    res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    });
  }
  if (!res.ok) throw new Error(`could not authenticate: ${res.status}`);

  cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!cookie) throw new Error("no session cookie returned");
  console.log(`  · signed in as ${DEMO_EMAIL}`);
}

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function makePdf(title: string, clauses: string[]) {
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);

  page.drawText(title, { x: 56, y: 770, size: 22, font: bold, color: rgb(0.08, 0.1, 0.15) });
  let y = 720;
  clauses.forEach((c, i) => {
    page.drawText(`${i + 1}.`, { x: 56, y, size: 11, font: bold, color: rgb(0.1, 0.12, 0.18) });
    for (const line of c.match(/.{1,78}(\s|$)/g) ?? []) {
      page.drawText(line.trim(), { x: 76, y, size: 10.5, font: body, color: rgb(0.24, 0.27, 0.33) });
      y -= 17;
    }
    y -= 12;
  });

  page.drawText("Signatures", { x: 56, y: 300, size: 13, font: bold, color: rgb(0.08, 0.1, 0.15) });
  page.drawLine({ start: { x: 56, y: 200 }, end: { x: 270, y: 200 }, thickness: 1, color: rgb(0.7, 0.74, 0.8) });
  page.drawLine({ start: { x: 320, y: 200 }, end: { x: 534, y: 200 }, thickness: 1, color: rgb(0.7, 0.74, 0.8) });
  return doc.save();
}

async function upload(title: string, clauses: string[]) {
  const bytes = await makePdf(title, clauses);
  const fd = new FormData();
  fd.append(
    "file",
    new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
    `${title}.pdf`,
  );
  fd.append("title", title);
  const res = await fetch(`${API}/api/documents`, {
    method: "POST",
    body: fd,
    headers: { cookie },
  });
  return res.json() as Promise<{ id: string }>;
}

const send = (id: string, payload: unknown) =>
  fetch(`${API}/api/documents/${id}/send`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(payload),
  }).then((r) => r.json());

const sign = (token: string) =>
  fetch(`${API}/api/sign/${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signature: PNG, consent: true }),
  }).then((r) => r.json());

const tok = (link: string) => link.split("/").pop()!;

const box = (signerIndex: number, x: number) => ({
  signerIndex,
  page: 0,
  x,
  y: 0.735,
  w: 0.3,
  h: 0.055,
});

const CLAUSES = [
  "The Consultant will provide advisory services as described in Schedule A, beginning on the effective date and continuing until either party gives thirty days written notice.",
  "Fees are invoiced monthly in arrears and payable within fourteen days of receipt. Late amounts accrue interest at 1.5% per month.",
  "Each party will keep the other's confidential information in confidence and will not disclose it to any third party without prior written consent.",
  "This agreement is governed by the laws of the jurisdiction in which the Company is registered.",
];

console.log(`Seeding ${API}…`);
await authenticate();

// 1 — completed, two signers
const a = await upload("Consulting Agreement", CLAUSES);
const aSent = await send(a.id, {
  mode: "sequential",
  expiresInDays: 30,
  signers: [
    { name: "Sarah Jenkins", email: "sarah.jenkins@northwind.test" },
    { name: "Alex Rivera", email: "alex@docflow.app" },
  ],
  fields: [box(0, 0.09), box(1, 0.53)],
});
await sign(tok(aSent.signers[0].link));
await sign(tok(aSent.signers[1].link));
console.log("  ✓ Consulting Agreement — completed");

// 2 — one signed, one still waiting
const b = await upload("Vendor Agreement — Q4", CLAUSES.slice(0, 3));
const bSent = await send(b.id, {
  mode: "sequential",
  expiresInDays: 21,
  signers: [
    { name: "Marcus Bell", email: "marcus.bell@lumenparts.test" },
    { name: "Priya Raman", email: "priya.raman@lumenparts.test" },
  ],
  fields: [box(0, 0.09), box(1, 0.53)],
});
await sign(tok(bSent.signers[0].link));
console.log("  ✓ Vendor Agreement — waiting on signer 2");

// 3 — sent, untouched
const c = await upload("Mutual NDA", CLAUSES.slice(2));
await send(c.id, {
  mode: "parallel",
  expiresInDays: 14,
  signers: [
    { name: "Alex Rivera", email: DEMO_EMAIL },
    { name: "Tomas Lindqvist", email: "tomas@brightfold.test" },
  ],
  fields: [box(0, 0.09), box(1, 0.53)],
});
console.log("  ✓ Mutual NDA — awaiting both");

// 4 — draft
await upload("Employee Handbook Acknowledgement", CLAUSES.slice(0, 2));
console.log("  ✓ Employee Handbook Acknowledgement — draft");

console.log(`Done. Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
