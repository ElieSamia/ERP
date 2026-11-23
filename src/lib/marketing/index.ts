import { ObjectId, type Document, type WithId } from 'mongodb';
import { db } from '../db';
import { decrypt, encrypt, logoTag } from '../mail';
import { getCompany } from '../queries';
import { r2, sell } from '../constants';
import { brevo, mailchimp, ProviderError, type Provider, type Stats } from './providers';

/* ---------- Settings: which service, its key (encrypted), and the sender ---------- */
export type MarketingSettings = {
  provider: '' | 'mailchimp' | 'brevo'; fromName: string; fromEmail: string; replyTo: string; address: string;
  mailchimpList: string; hasMailchimpKey: boolean; hasBrevoKey: boolean;
};
type Stored = Omit<MarketingSettings, 'hasMailchimpKey' | 'hasBrevoKey'> & { mailchimpKey?: string; brevoKey?: string };
const DEF: Stored = { provider: '', fromName: '', fromEmail: '', replyTo: '', address: '', mailchimpList: '' };

async function stored(): Promise<Stored> {
  const d = await (await db()).collection<{ _id: string } & Stored>('settings').findOne({ _id: 'marketing' });
  const { _id, ...rest } = d ?? ({} as { _id: string } & Stored);
  void _id;
  const company = await getCompany();
  // The postal address in the footer defaults to the company address until you set one.
  return { ...DEF, ...rest, address: rest.address || company.address || '' };
}
export async function getMarketingSettings(): Promise<MarketingSettings> {
  const { mailchimpKey, brevoKey, ...s } = await stored();
  return { ...s, hasMailchimpKey: !!mailchimpKey, hasBrevoKey: !!brevoKey };
}
export async function saveMarketingSettings(s: Omit<MarketingSettings, 'hasMailchimpKey' | 'hasBrevoKey'> & { mailchimpKey?: string; brevoKey?: string }) {
  const { mailchimpKey, brevoKey, ...rest } = s;
  const set: Record<string, unknown> = { ...rest };
  if (mailchimpKey) set.mailchimpKey = encrypt(mailchimpKey.trim());
  if (brevoKey) set.brevoKey = encrypt(brevoKey.trim());
  await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'marketing' }, { $set: set }, { upsert: true });
}
/** The service to use. `which` picks one explicitly, for checking a connection before choosing it. */
export async function provider(which?: 'mailchimp' | 'brevo'): Promise<Provider> {
  const s = await stored();
  const p = which ?? s.provider;
  if (p === 'mailchimp') { if (!s.mailchimpKey) throw new ProviderError('Add your Mailchimp API key in Settings first.'); return mailchimp(decrypt(s.mailchimpKey), s.mailchimpList); }
  if (p === 'brevo') { if (!s.brevoKey) throw new ProviderError('Add your Brevo API key in Settings first.'); return brevo(decrypt(s.brevoKey)); }
  throw new ProviderError('Choose Mailchimp or Brevo under Marketing → Connection first.');
}

/* ---------- Audiences: saved filters over your contacts and their bookings ---------- */
export type AudienceFilter = {
  types: string[]; country: string; city: string; destination: string;
  booked: '' | 'within' | 'not-within'; months: number; minSpent: number; portal: '' | 'yes' | 'no';
  /** Contacts with any of these tags (empty = no tag condition). */
  tags: string[];
  /** Hand-picked contacts, always included. */
  includeIds: string[];
  /** Only the hand-picked contacts, ignoring the rules. */
  onlyPicked: boolean;
};
export type Audience = { id: string; name: string; desc: string; filter: AudienceFilter; createdAt?: string };
export const EMPTY_FILTER: AudienceFilter = { types: ['customer', 'agency', 'corporate'], country: '', city: '', destination: '', booked: '', months: 12, minSpent: 0, portal: '', tags: [], includeIds: [], onlyPicked: false };
export const toAudience = (d: WithId<Document>): Audience => ({ id: String(d._id), name: d.name, desc: d.desc || '', filter: { ...EMPTY_FILTER, ...(d.filter || {}) }, createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt });

export type Member = { id: string; name: string; email: string; phone: string; type: string; marketing: 'yes' | 'no'; waMarketing: 'yes' | 'no'; spent: number; lastBooking: string; picked?: boolean };

/**
 * Everyone an audience currently matches, with whether each can be emailed. Recalculated every time,
 * so it always reflects today's contacts and bookings. Suppliers are never included.
 */
export async function resolveAudience(f: AudienceFilter): Promise<Member[]> {
  const d = await db();
  const picked = (f.includeIds ?? []).filter((x) => ObjectId.isValid(x)).map((x) => new ObjectId(x));
  const rules: Record<string, unknown> = { type: { $in: f.types.filter((t) => t !== 'supplier') } };
  const q = rules;
  const rx = (v: string) => ({ $regex: v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' });
  if (f.country.trim()) q.country = rx(f.country.trim());
  if (f.city.trim()) q.city = rx(f.city.trim());
  if (f.portal) q.portalAccess = f.portal === 'yes' ? 'yes' : { $ne: 'yes' };
  if (f.tags?.length) q.tags = { $in: f.tags };
  const proj = { projection: { name: 1, email: 1, phone: 1, type: 1, marketing: 1, waMarketing: 1 } };
  const byRules = f.onlyPicked ? [] : await d.collection('contacts').find(q, proj).toArray();
  const extra = picked.length ? await d.collection('contacts').find({ _id: { $in: picked }, type: { $ne: 'supplier' } }, proj).toArray() : [];
  const pickedSet = new Set(extra.map((c) => String(c._id)));
  const contacts = [...byRules.filter((c) => !pickedSet.has(String(c._id))), ...extra];
  const ids = contacts.map((c) => String(c._id));
  const bookings = await d.collection('bookings').find({ contactId: { $in: ids }, status: { $in: ['confirmed', 'ticketed', 'invoiced'] } }, { projection: { contactId: 1, bookingDate: 1, destinationName: 1, destination: 1, lines: 1 } }).toArray();
  const since = new Date(); since.setUTCMonth(since.getUTCMonth() - (f.months || 12));
  const sinceISO = since.toISOString().slice(0, 10);
  const dest = f.destination.trim().toLowerCase();
  return contacts.map((c) => {
    const bs = bookings.filter((b) => String(b.contactId) === String(c._id));
    const spent = r2(bs.reduce((s, b) => s + ((b.lines as Parameters<typeof sell>[0][]) || []).reduce((x, l) => x + sell(l), 0), 0));
    const last = bs.map((b) => String(b.bookingDate)).sort().at(-1) ?? '';
    return { c, bs, spent, last };
  }).filter(({ c, bs, spent, last }) => pickedSet.has(String(c._id)) || (
    (!dest || bs.some((b) => `${b.destinationName || ''} ${b.destination || ''}`.toLowerCase().includes(dest)))
    && (!f.minSpent || spent >= f.minSpent)
    && (f.booked !== 'within' || last >= sinceISO)
    && (f.booked !== 'not-within' || !last || last < sinceISO)),
  ).map(({ c, spent, last }) => ({ id: String(c._id), name: String(c.name), email: String(c.email || ''), phone: String(c.phone || ''), type: String(c.type), marketing: (c.marketing === 'no' ? 'no' : 'yes') as Member['marketing'], waMarketing: (c.waMarketing === 'yes' ? 'yes' : 'no') as Member['waMarketing'], spent, lastBooking: last, picked: pickedSet.has(String(c._id)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
/** Who a campaign may actually reach: an email address and not unsubscribed. */
export const reachable = (m: Member[]) => m.filter((x) => x.email && x.marketing === 'yes');
/** WhatsApp offers: a phone with country code and the customer’s WhatsApp consent. */
export const reachableWa = (m: Member[]) => m.filter((x) => x.waMarketing === 'yes' && /^[1-9]\d{7,14}$/.test(x.phone.replace(/\D/g, '').replace(/^00/, '')));

/* ---------- Campaigns ---------- */
export type Campaign = {
  id: string; name: string; subject: string; preheader: string; heading: string; body: string; imageUrl: string;
  buttonText: string; buttonUrl: string; audienceId: string; status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  provider: string; providerId: string; scheduledAt: string; sentAt: string; recipients: number; stats: Stats | null; statsAt: string; error: string; createdBy: string; createdAt?: string;
  channel: 'email' | 'whatsapp'; waTemplate: string; waLanguage: string; waParams: string[]; waButton: string;
  waStats?: { sent: number; delivered: number; read: number; failed: number; replies: number; stops: number; pending: number } | null;
};
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ''));
export const toCampaign = (d: WithId<Document>): Campaign => ({
  id: String(d._id), name: d.name, subject: d.subject || '', preheader: d.preheader || '', heading: d.heading || '', body: d.body || '', imageUrl: d.imageUrl || '',
  buttonText: d.buttonText || '', buttonUrl: d.buttonUrl || '', audienceId: d.audienceId || '', status: d.status || 'draft', provider: d.provider || '', providerId: d.providerId || '',
  scheduledAt: iso(d.scheduledAt), sentAt: iso(d.sentAt), recipients: d.recipients ?? 0, stats: d.stats ?? null, statsAt: iso(d.statsAt), error: d.error || '', createdBy: d.createdBy || '', createdAt: iso(d.createdAt),
  channel: d.channel === 'whatsapp' ? 'whatsapp' : 'email', waTemplate: d.waTemplate || '', waLanguage: d.waLanguage || '', waParams: d.waParams || [], waButton: d.waButton || '', waStats: d.waStats ?? null,
});
export async function getCampaign(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('campaigns').findOne({ _id: new ObjectId(id) });
  return d ? toCampaign(d) : null;
}
export async function getAudience(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('audiences').findOne({ _id: new ObjectId(id) });
  return d ? toAudience(d) : null;
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The campaign email: the same Outlook-safe table layout as the ERP's other emails, plus the unsubscribe link
 * and postal address that anti-spam rules require. `unsub` is the service's own unsubscribe tag.
 */
export async function campaignHtml(c: Pick<Campaign, 'heading' | 'body' | 'imageUrl' | 'buttonText' | 'buttonUrl' | 'preheader'>, unsub: string | null) {
  const s = await stored();
  const company = await getCompany();
  const font = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const paras = c.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p style="margin:0 0 14px;${font};font-size:15px;line-height:1.6;color:#17201f">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const logo = await logoTag(company.name || '');
  const img = /^https:\/\//.test(c.imageUrl) ? `<img src="${esc(c.imageUrl)}" width="512" alt="" style="display:block;width:100%;max-width:512px;height:auto;border-radius:8px;margin:0 0 18px;border:0">` : '';
  const btn = c.buttonText && /^https?:\/\//.test(c.buttonUrl) ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 6px"><tr><td bgcolor="#0F6E66" style="background:#0F6E66;border-radius:8px;padding:11px 20px;mso-line-height-rule:exactly;line-height:20px"><a href="${esc(c.buttonUrl)}" target="_blank" style="${font};font-size:15px;font-weight:600;line-height:20px;mso-line-height-rule:exactly;color:#ffffff;text-decoration:none"><span style="color:#ffffff">${esc(c.buttonText)}</span></a></td></tr></table>` : '';
  const foot = `${esc(company.name || '')}${s.address ? `<br>${esc(s.address)}` : ''}<br>You get this email because you’re a customer of ${esc(company.name || 'ours')}. ${unsub ? `<a href="${unsub}" style="color:#5b6b6a">Unsubscribe</a>` : '<span style="color:#5b6b6a">Unsubscribe link appears here</span>'}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.heading)}</title></head>
<body style="margin:0;padding:0;background:#f2f5f4"><div style="display:none;max-height:0;overflow:hidden">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f5f4" style="background:#f2f5f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #dde5e3;border-radius:12px;padding:26px 24px">${logo}${img}
<h1 style="margin:0 0 16px;${font};font-size:21px;line-height:1.3;color:#17201f">${esc(c.heading)}</h1>${paras}${btn}</td></tr>
<tr><td style="padding:14px 4px;${font};font-size:12px;line-height:1.5;color:#5b6b6a">${foot}</td></tr></table></td></tr></table></body></html>`;
}

/** Reads a sent campaign's results and applies unsubscribes and bounces to your contacts. */
export async function refreshStats(c: Campaign, by: string) {
  const d = await db();
  const doc = await d.collection('campaigns').findOne({ _id: new ObjectId(c.id) });
  if (!doc?.providerId) return c;
  const p = await provider(doc.provider as 'mailchimp' | 'brevo');
  const st = await p.stats(doc.providerId, doc.listRef);
  const gone = [...new Set([...st.unsubscribedEmails, ...st.bouncedEmails])];
  if (gone.length) {
    const hit = await d.collection('contacts').find({ email: { $in: gone }, marketing: { $ne: 'no' } }, { projection: { _id: 1, email: 1 } }).toArray();
    if (hit.length) {
      await d.collection('contacts').updateMany({ _id: { $in: hit.map((h) => h._id) } }, { $set: { marketing: 'no' } });
      const { logActivity } = await import('../activity');
      for (const h of hit) await logActivity('contact', String(h._id), by, `${st.bouncedEmails.includes(String(h.email)) ? 'Email bounced' : 'Unsubscribed'} from email marketing (campaign “${doc.name}”). Marketing messages turned off.`);
    }
  }
  await d.collection('campaigns').updateOne({ _id: doc._id }, { $set: { stats: st, statsAt: new Date(), ...(doc.status === 'scheduled' && st.sent > 0 ? { status: 'sent', sentAt: new Date() } : {}) } });
  return (await getCampaign(c.id))!;
}

/* ---------- WhatsApp campaigns ---------- */
export const STOP_WORDS = /^\s*(stop|unsubscribe|cancel|no more|الغاء|إلغاء|توقف|ستوب)\s*[.!]?\s*$/i;
const fill = (p: string, name: string) => p.replace(/\{name\}/gi, name.split(' ')[0] || name);

/** Queues every recipient once; sending then runs in batches (see waBatch), so large lists fit the server's time limits. */
export async function queueWaCampaign(c: Campaign, to: Member[], by: string) {
  const d = await db();
  await d.collection('waqueue').insertMany(to.map((m) => ({ campaignId: c.id, phone: m.phone.replace(/\D/g, '').replace(/^00/, ''), name: m.name, contactId: m.id, status: 'pending', at: new Date() })));
  await d.collection('campaigns').updateOne({ _id: new ObjectId(c.id) }, { $set: { status: 'sending', provider: 'whatsapp', recipients: to.length, sentBy: by, error: '', recipientEmails: [] } });
}
/** Sends up to 25 queued messages; the screen calls it again until nothing is left. */
export async function waBatch(id: string, by: string) {
  const d = await db();
  const c = await getCampaign(id);
  if (!c) throw new ProviderError('Campaign not found.');
  const { sendTemplate } = await import('../whatsapp');
  const q = d.collection('waqueue');
  for (let i = 0; i < 25; i++) {
    const job = await q.findOneAndUpdate({ campaignId: id, status: 'pending' }, { $set: { status: 'working', claimedAt: new Date() } }, { returnDocument: 'after' });
    if (!job) break;
    try {
      await sendTemplate({ to: String(job.phone), template: c.waTemplate, language: c.waLanguage, params: c.waParams.map((p) => fill(p, String(job.name))), urlSuffix: c.waButton || undefined, by: `${by} (campaign)`, ref: { model: 'campaign', id } });
      await q.updateOne({ _id: job._id }, { $set: { status: 'sent' } });
    } catch (e) {
      await q.updateOne({ _id: job._id }, { $set: { status: 'failed', error: (e as Error).message } });
    }
  }
  const [pending, working, sent, failed] = await Promise.all(['pending', 'working', 'sent', 'failed'].map((s) => q.countDocuments({ campaignId: id, status: s })));
  if (!pending && !working && c.status === 'sending') await d.collection('campaigns').updateOne({ _id: new ObjectId(id) }, { $set: { status: 'sent', sentAt: new Date() } });
  return { pending, sent, failed, done: !pending && !working };
}
/** Delivery, reads, replies and opt-outs, from the WhatsApp messages this campaign sent. */
export async function waStats(id: string) {
  const d = await db();
  const msgs = await d.collection('wamessages').find({ 'ref.model': 'campaign', 'ref.id': id, direction: 'out' }, { projection: { phone: 1, status: 1, at: 1 } }).toArray();
  const pending = await d.collection('waqueue').countDocuments({ campaignId: id, status: { $in: ['pending', 'working'] } });
  const phones = [...new Set(msgs.map((m) => String(m.phone)))];
  // WhatsApp stamps replies to the whole second: allow for that rounding.
  const since = msgs.reduce((t, m) => Math.min(t, (m.at as Date).getTime()), Date.now()) - 1000;
  const ins = phones.length ? await d.collection('wamessages').find({ direction: 'in', phone: { $in: phones }, at: { $gte: new Date(since) } }, { projection: { phone: 1, body: 1 } }).toArray() : [];
  const st = {
    sent: msgs.filter((m) => m.status !== 'failed').length, delivered: msgs.filter((m) => ['delivered', 'read'].includes(String(m.status))).length,
    read: msgs.filter((m) => m.status === 'read').length, failed: msgs.filter((m) => m.status === 'failed').length + (await d.collection('waqueue').countDocuments({ campaignId: id, status: 'failed' })) - msgs.filter((m) => m.status === 'failed').length,
    replies: new Set(ins.filter((m) => !STOP_WORDS.test(String(m.body))).map((m) => String(m.phone))).size, stops: new Set(ins.filter((m) => STOP_WORDS.test(String(m.body))).map((m) => String(m.phone))).size, pending,
  };
  await d.collection('campaigns').updateOne({ _id: new ObjectId(id) }, { $set: { waStats: st, statsAt: new Date() } });
  return st;
}
