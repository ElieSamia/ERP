import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { db } from './db';
import { HttpError } from './api';
import { logActivity } from './activity';
import { appUrl, getMailSettings, layout, mailReady, sendMail } from './mail';
import { getCompany } from './queries';
import { money } from './constants';

/**
 * Enquiries from your website become CRM opportunities. Spam is kept out without puzzles: a hidden field that only
 * bots fill, a minimum time to fill the form, a limit per visitor, and only your own websites may send.
 */
export type EnquirySettings = { enabled: boolean; siteKey: string; origins: string[]; notify: boolean; autoReply: boolean; autoReplyText: string; thankYou: string };
const DEF: Omit<EnquirySettings, 'siteKey'> = {
  enabled: false, origins: ['https://thetravelconsult.com', 'https://www.thetravelconsult.com'], notify: true, autoReply: true,
  autoReplyText: 'Thank you for your enquiry. One of our travel consultants will contact you shortly with options.',
  thankYou: 'Thank you! We’ve received your request and will get back to you shortly.',
};
export async function getEnquirySettings(): Promise<EnquirySettings> {
  const col = (await db()).collection<{ _id: string } & Partial<EnquirySettings>>('settings');
  let d = await col.findOne({ _id: 'enquiry' });
  if (!d?.siteKey) { await col.updateOne({ _id: 'enquiry' }, { $set: { siteKey: `site_${randomBytes(12).toString('hex')}` } }, { upsert: true }); d = await col.findOne({ _id: 'enquiry' }); }
  const { _id, ...rest } = d!;
  void _id;
  return { ...DEF, ...rest } as EnquirySettings;
}
export async function saveEnquirySettings(s: Partial<EnquirySettings> & { newKey?: boolean }) {
  const { newKey, ...rest } = s;
  await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'enquiry' }, { $set: { ...rest, ...(newKey ? { siteKey: `site_${randomBytes(12).toString('hex')}` } : {}) } }, { upsert: true });
}

export const TYPES: [string, string][] = [['flight', 'Flights'], ['hotel', 'Hotel'], ['package', 'Holiday package'], ['visa', 'Visa'], ['insurance', 'Travel insurance'], ['transfer', 'Transfers'], ['other', 'Something else']];
const date = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default('');
export const enquirySchema = z.object({
  key: z.string().max(60),
  name: z.string().trim().min(2, 'Please enter your name.').max(100),
  email: z.string().trim().toLowerCase().max(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Please check your email address.').default(''),
  phone: z.string().trim().max(30).default(''),
  type: z.enum(TYPES.map(([k]) => k) as [string, ...string[]]).default('other'),
  destination: z.string().trim().max(120).default(''),
  from: date, to: date,
  adults: z.coerce.number().int().min(0).max(99).default(1), children: z.coerce.number().int().min(0).max(99).default(0),
  budget: z.coerce.number().min(0).max(10_000_000).default(0),
  message: z.string().trim().max(3000).default(''),
  marketing: z.union([z.boolean(), z.literal('on'), z.literal('yes'), z.literal('')]).default(false),
  page: z.string().trim().max(500).default(''),
  utm: z.string().trim().max(300).default(''),
  website: z.string().max(200).default(''), // hidden from people; bots fill it in
  started: z.coerce.number().default(0),    // when the form was shown (ms)
}).refine((e) => e.email || e.phone.replace(/\D/g, '').length >= 7, { message: 'Please give an email address or a phone number so we can reach you.' });

/** Origins allowed to send: your websites, plus the ERP's own hosted form. */
export async function originAllowed(origin: string | null, own: string) {
  if (!origin) return true; // server-to-server posts (for example a WordPress form plugin's webhook) send no Origin
  const s = await getEnquirySettings();
  const o = origin.replace(/\/+$/, '').toLowerCase();
  return o === own.replace(/\/+$/, '').toLowerCase() || s.origins.some((x) => x.replace(/\/+$/, '').toLowerCase() === o);
}

/** Returns the thank-you text for the visitor. Spam is accepted silently (so bots learn nothing) but never saved. */
export async function receiveEnquiry(raw: unknown, ip: string): Promise<{ message: string; spam?: boolean; leadId?: string }> {
  const s = await getEnquirySettings();
  const e = enquirySchema.parse(raw);
  if (!s.enabled || e.key !== s.siteKey) throw new HttpError(403, 'This form isn’t accepting enquiries at the moment.');
  if (e.website || (e.started && Date.now() - e.started < 3000)) return { message: s.thankYou, spam: true };
  // At most 5 enquiries per visitor per hour; the IP address is kept only as a one-way hash, and only for an hour.
  const d = await db();
  const bucket = `${createHash('sha256').update(`${ip}:${process.env.AUTH_SECRET ?? ''}`).digest('hex').slice(0, 24)}:${Math.floor(Date.now() / 3600e3)}`;
  const r = await d.collection<{ _id: string; n: number; expiresAt: Date }>('enqlimits').findOneAndUpdate({ _id: bucket }, { $inc: { n: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 3600e3) } }, { upsert: true, returnDocument: 'after' });
  if ((r?.n ?? 1) > 5) throw new HttpError(429, 'You’ve sent several requests already. Please wait a little, or call us.');

  // An existing contact with the same email or phone gets the opportunity; otherwise a new customer is created.
  const digits = e.phone.replace(/\D/g, '');
  const contacts = d.collection('contacts');
  const byEmail = e.email ? await contacts.findOne({ email: e.email }) : null;
  const byPhone = !byEmail && digits.length >= 7 ? await contacts.findOne({ phone: { $regex: digits.slice(-7).split('').join('\\D*') } }) : null;
  let contact = byEmail ?? byPhone;
  const wantsNews = e.marketing === true || e.marketing === 'on' || e.marketing === 'yes';
  if (!contact) {
    const ins = await contacts.insertOne({ name: e.name, type: 'customer', email: e.email, phone: e.phone, city: '', country: '', creditLimit: 0, marketing: wantsNews ? 'yes' : 'no', portalAccess: 'no', notes: 'Created from a website enquiry.', createdAt: new Date(), createdBy: 'Website form' });
    contact = await contacts.findOne({ _id: ins.insertedId });
    await logActivity('contact', String(ins.insertedId), 'Website form', 'Contact created from a website enquiry.');
  } else if (wantsNews && contact.marketing !== 'yes') {
    await contacts.updateOne({ _id: contact._id }, { $set: { marketing: 'yes' } });
  }
  const label = TYPES.find(([k]) => k === e.type)?.[1] ?? 'Enquiry';
  const when = e.from ? `${e.from.split('-').reverse().join('/')}${e.to ? `–${e.to.split('-').reverse().join('/')}` : ''}` : '';
  const title = `Website: ${label}${e.destination ? `, ${e.destination}` : ''}${when ? `, ${when}` : ''}`.slice(0, 150);
  const notes = [
    `Website enquiry, ${new Date().toISOString().slice(0, 10).split('-').reverse().join('/')}`,
    `From: ${e.name}${e.email ? `, ${e.email}` : ''}${e.phone ? `, ${e.phone}` : ''}`,
    `Wants: ${label}${e.destination ? ` to ${e.destination}` : ''}${when ? `, ${when}` : ''}, ${e.adults} adult${e.adults === 1 ? '' : 's'}${e.children ? `, ${e.children} child${e.children === 1 ? '' : 'ren'}` : ''}${e.budget ? `, budget ${money(e.budget)}` : ''}`,
    ...(e.message ? ['', e.message] : []), '',
    `${wantsNews ? 'Agreed to receive offers by email.' : 'Didn’t ask for marketing emails.'}${e.page ? ` Sent from ${e.page}.` : ''}${e.utm ? ` Campaign: ${e.utm}.` : ''}`,
    `Matched to ${byEmail || byPhone ? `the existing contact ${contact!.name}` : 'a new contact'}.`,
  ].join('\n');
  const lead = await d.collection('leads').insertOne({ ref: await (await import('./enquiries')).nextLeadRef(), title, contactId: String(contact!._id), stage: 'new', destination: e.destination, travelDate: e.from, pax: e.adults + e.children, budget: e.budget, notes, source: 'website', createdAt: new Date(), createdBy: 'Website form' });
  const leadId = String(lead.insertedId);
  await logActivity('lead', leadId, 'Website form', `Opportunity created from a website enquiry by ${e.name}.`);

  if (await mailReady()) {
    const base = await appUrl();
    const company = (await getCompany()).name || 'our team';
    if (s.notify) {
      const to = (await getMailSettings()).notifyTo.split(/[,;\s]+/).filter((x) => x.includes('@'));
      if (to.length) {
        const m = await layout({ heading: `New website enquiry: ${label}${e.destination ? `, ${e.destination}` : ''}`, paragraphs: notes.split('\n\n'), button: { text: 'Open in the CRM', url: `${base}/crm/${leadId}` } });
        await sendMail({ to, subject: `Website enquiry from ${e.name}`, ...m, kind: 'enquiry', ref: { model: 'lead', id: leadId }, replyTo: e.email || undefined });
      }
    }
    if (s.autoReply && e.email) {
      const m = await layout({ heading: `Thank you, ${e.name.split(' ')[0]}`, paragraphs: [s.autoReplyText, `Your request: ${label}${e.destination ? ` to ${e.destination}` : ''}${when ? `, ${when}` : ''}.`, `Kind regards,\n${company}`] });
      await sendMail({ to: e.email, subject: `We received your request – ${company}`, ...m, kind: 'enquiry-reply', ref: { model: 'lead', id: leadId } });
    }
  }
  return { message: s.thankYou, leadId };
}
