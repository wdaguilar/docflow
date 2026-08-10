/**
 * Email delivery. Falls back to logging when RESEND_API_KEY is absent so the
 * app runs end-to-end on a laptop with no credentials.
 */

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM ?? "DocFlow <onboarding@resend.dev>";

export interface Mail {
  to: string;
  subject: string;
  html: string;
}

export async function send(mail: Mail): Promise<{ delivered: boolean; reason?: string }> {
  if (!KEY) {
    console.log(`[mail:dry-run] -> ${mail.to} :: ${mail.subject}`);
    return { delivered: false, reason: "no_api_key" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, html: mail.html }),
    });
    if (!res.ok) {
      return { delivered: false, reason: `resend_${res.status}` };
    }
    return { delivered: true };
  } catch (err) {
    return { delivered: false, reason: String(err) };
  }
}

const shell = (body: string) => `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0d1117;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px">
    ${body}
  </div>
</div>`;

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${label}</a>`;

export function signatureRequest(o: {
  signer: string;
  requester: string;
  title: string;
  url: string;
  expires: number | null;
}): string {
  return shell(`
    <h1 style="font-size:20px;margin:0 0 8px">${o.requester} needs your signature</h1>
    <p style="color:#475569;line-height:1.6">Hi ${o.signer}, <strong>${o.title}</strong> is ready for you.</p>
    <p style="margin:24px 0">${button(o.url, "Review and sign")}</p>
    ${o.expires ? `<p style="color:#94a3b8;font-size:13px">This link expires ${new Date(o.expires).toDateString()}.</p>` : ""}
    <p style="color:#94a3b8;font-size:12px">Don't share this link — it opens the document as you.</p>
  `);
}

export function completed(o: { title: string; url: string; digest: string }): string {
  return shell(`
    <h1 style="font-size:20px;margin:0 0 8px">Everyone has signed</h1>
    <p style="color:#475569;line-height:1.6"><strong>${o.title}</strong> is complete. The signed copy includes a certificate page with the full audit trail.</p>
    <p style="margin:24px 0">${button(o.url, "Download signed copy")}</p>
    <p style="color:#94a3b8;font-size:12px">Fingerprint ${o.digest.slice(0, 16).toUpperCase()}</p>
  `);
}
