import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import { db } from './db';
import { getCompany } from './queries';

/** SMTP settings, kept in the database. The password is encrypted with a key derived from AUTH_SECRET. */
export type MailSettings = {
  enabled: boolean; host: string; port: number; secure: boolean; user: string; fromName: string; fromEmail: string;
  replyTo: string; notifyTo: string; appUrl: string; hasPassword: boolean;
};
type Stored = Omit<MailSettings, 'hasPassword'> & { passEnc?: string };
const DEFAULTS: Omit<MailSettings, 'hasPassword'> = {
  enabled: false, host: 'smtppro.zoho.com', port: 465, secure: true, user: '', fromName: '', fromEmail: '', replyTo: '', notifyTo: '', appUrl: '',
};

const key = () => createHash('sha256').update(`${process.env.AUTH_SECRET ?? ''}:mail-password`).digest();
export function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(s: string) {
  const [iv, tag, enc] = s.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

async function stored(): Promise<Stored> {
  const d = await (await db()).collection<{ _id: string } & Stored>('settings').findOne({ _id: 'mail' });
  const { _id, ...rest } = d ?? ({} as { _id: string } & Stored);
  void _id;
  return { ...DEFAULTS, ...rest };
}
/** Settings as the browser may see them: never the password. */
export async function getMailSettings(): Promise<MailSettings> {
  const { passEnc, ...s } = await stored();
  return { ...s, hasPassword: !!passEnc };
}
export async function saveMailSettings(s: Omit<MailSettings, 'hasPassword'> & { password?: string }) {
  const { password, ...rest } = s;
  const set: Record<string, unknown> = { ...rest };
  if (password) set.passEnc = encrypt(password);
  await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'mail' }, { $set: set }, { upsert: true });
}
export async function mailReady() {
  const s = await stored();
  return s.enabled && !!s.host && !!s.user && !!s.passEnc && !!s.fromEmail;
}

/** The address links in emails point to: the setting, else Vercel's production address, else the request's. */
export async function appUrl(fallback?: string) {
  const s = await stored();
  const v = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (s.appUrl || (v ? `https://${v}` : '') || fallback || '').replace(/\/+$/, '');
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * One simple, readable email layout: heading, short paragraphs, one button, company footer.
 * Built entirely from tables with bgcolor, which is what Outlook for Windows needs to draw it as one card;
 * Gmail, Apple Mail and phones draw it the same way.
 */
export async function layout(o: { heading: string; paragraphs: string[]; button?: { text: string; url: string }; footer?: string }) {
  const company = await getCompany();
  const font = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const body = o.paragraphs.map((p) => `<p style="margin:0 0 14px;${font};font-size:15px;line-height:1.55;color:#17201f">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const btn = o.button ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 16px"><tr>`
    + `<td bgcolor="#0F6E66" style="background:#0F6E66;border-radius:8px;padding:11px 20px">`
    + `<a href="${esc(o.button.url)}" target="_blank" style="${font};font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none"><span style="color:#ffffff">${esc(o.button.text)}</span></a>`
    + `</td></tr></table>`
    + `<p style="margin:0;${font};font-size:13px;line-height:1.5;color:#5b6b6a">If the button doesn’t work, copy this address into your browser:<br><a href="${esc(o.button.url)}" style="color:#0F6E66;word-break:break-all">${esc(o.button.url)}</a></p>` : '';
  const foot = `${esc(company.name || '')}${company.phone ? ` · ${esc(company.phone)}` : ''}${company.email ? ` · ${esc(company.email)}` : ''}${o.footer ? `<br>${esc(o.footer)}` : ''}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f5f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f5f4" style="background:#f2f5f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #dde5e3;border-radius:12px;padding:26px 24px">
<h1 style="margin:0 0 16px;${font};font-size:19px;line-height:1.3;color:#17201f">${esc(o.heading)}</h1>${body}${btn}
</td></tr>
<tr><td style="padding:14px 4px;${font};font-size:12.5px;line-height:1.5;color:#5b6b6a">${foot}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [o.heading, '', ...o.paragraphs, ...(o.button ? ['', `${o.button.text}: ${o.button.url}`] : []), '', company.name || ''].join('\n');
  return { html, text };
}

export type MailResult = { sent: boolean; error?: string };

/**
 * Sends one email and records it in the email log. Never throws: a mail problem must not break the action that
 * triggered it, so callers get { sent, error } and decide what to tell the user.
 */
export async function sendMail(m: { to: string | string[]; subject: string; html: string; text: string; kind: string; ref?: { model: string; id: string }; replyTo?: string }): Promise<MailResult> {
  const to = (Array.isArray(m.to) ? m.to : [m.to]).map((x) => x.trim()).filter(Boolean);
  const log = async (status: 'sent' | 'failed' | 'skipped', error?: string) => {
    await (await db()).collection('emails').insertOne({ at: new Date(), to, subject: m.subject, kind: m.kind, ref: m.ref ?? null, status, error: error ?? null }).catch(() => null);
  };
  if (!to.length) return { sent: false, error: 'No email address.' };
  const s = await stored();
  if (!s.enabled || !s.passEnc || !s.host || !s.user || !s.fromEmail) { await log('skipped', 'Email sending is not set up.'); return { sent: false, error: 'Email sending isn’t set up yet. An administrator can set it up in Settings.' }; }
  try {
    const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, auth: { user: s.user, pass: decrypt(s.passEnc) }, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000 });
    await t.sendMail({
      from: { name: s.fromName || (await getCompany()).name || s.fromEmail, address: s.fromEmail }, to, subject: m.subject, html: m.html, text: m.text,
      replyTo: m.replyTo || s.replyTo || undefined,
    });
    await log('sent');
    return { sent: true };
  } catch (e) {
    const err = e as { code?: string; responseCode?: number; message?: string };
    const msg = err.responseCode === 535 || err.code === 'EAUTH' ? 'The mail server refused the username or password. In Zoho, use an application-specific password.'
      : err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION' || err.code === 'ESOCKET' ? 'Couldn’t reach the mail server. Check the server name and port.'
      : (err.message || 'Sending failed.').slice(0, 300);
    console.error('Mail failed', err.code, err.responseCode, err.message);
    await log('failed', msg);
    return { sent: false, error: msg };
  }
}

export async function recentEmails(limit = 25) {
  const list = await (await db()).collection('emails').find({}).sort({ at: -1 }).limit(limit).toArray();
  return list.map((e) => ({ id: String(e._id), at: (e.at as Date).toISOString(), to: (e.to as string[]).join(', '), subject: String(e.subject), kind: String(e.kind), status: String(e.status), error: e.error ? String(e.error) : '' }));
}

/** The invitation or new-password email for a portal user. Awaited, so the screen can say whether it went out. */
export async function sendInviteEmail(o: { to: string; name: string; url: string; reset?: boolean; account?: string; days?: number; selfService?: boolean }): Promise<MailResult> {
  const days = o.days ?? 7;
  const valid = days === 1 ? 'expires in 24 hours' : `expires in ${days} days`;
  const company = (await getCompany()).name || 'our team';
  const subject = o.reset ? `Set a new password for ${company}` : `Your access to the ${company} portal`;
  const m = await layout({
    heading: o.reset ? 'Set a new password' : `Welcome, ${o.name.split(' ')[0]}`,
    paragraphs: o.reset
      ? [`Hello ${o.name.split(' ')[0]},`, `Use the button below to choose a new password for the portal. The link works once and ${valid}.`, o.selfService ? 'If you didn’t ask for this, you can ignore this email. Your current password keeps working.' : 'Your previous password no longer works. If you didn’t expect this email, please contact us.']
      : [`${company} has given you access to its online portal${o.account ? ` for ${o.account}` : ''}.`, `Use the button below to choose your password. The link works once and ${valid}.`],
    button: { text: o.reset ? 'Choose a new password' : 'Set my password', url: o.url },
  });
  return sendMail({ to: o.to, subject, ...m, kind: o.reset ? 'password-reset' : 'invitation' });
}
