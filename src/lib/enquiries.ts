import { createHash, randomBytes } from 'crypto';
import { ObjectId, type Document, type WithId } from 'mongodb';
import { z } from 'zod';
import { db } from './db';
import { HttpError } from './api';
import { logActivity } from './activity';
import { appUrl, getMailSettings, layout, mailReady, sendMail } from './mail';
import { getCompany } from './queries';
import { money } from './constants';

/**
 * Enquiry sources: your website and any partner that sends enquiries to the ERP. Each has its own key (sent as
 * "Authorization: Bearer …"), its own switches and a log. Requests carry the sender's own ID, so a retry or the same
 * request arriving by form and WhatsApp never creates a second opportunity.
 */
export type Source = { id: string; name: string; keyHint: string; active: boolean; notify: boolean; autoReply: boolean; count: number; lastAt: string; createdAt: string };
const hashKey = (k: string) => createHash('sha256').update(k).digest('hex');
const toSource = (d: WithId<Document>): Source => ({
  id: String(d._id), name: d.name, keyHint: d.keyHint, active: d.active !== false, notify: !!d.notify, autoReply: !!d.autoReply,
  count: d.count ?? 0, lastAt: d.lastAt instanceof Date ? d.lastAt.toISOString() : '', createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : '',
});
const newKey = () => { const k = `ek_${randomBytes(24).toString('hex')}`; return { key: k, keyHash: hashKey(k), keyHint: `${k.slice(0, 7)}…${k.slice(-4)}` }; };

/** The list, creating the "Website" source the first time (team email and auto-reply off: your site sends its own). */
export async function listSources(): Promise<{ sources: Source[]; newKey?: { id: string; key: string } }> {
  const col = (await db()).collection('enqsources');
  if (!(await col.countDocuments())) {
    const k = newKey();
    const r = await col.insertOne({ name: 'Website', keyHash: k.keyHash, keyHint: k.keyHint, active: true, notify: false, autoReply: false, count: 0, createdAt: new Date() });
    return { sources: (await col.find().sort({ createdAt: 1 }).toArray()).map(toSource), newKey: { id: String(r.insertedId), key: k.key } };
  }
  return { sources: (await col.find().sort({ createdAt: 1 }).toArray()).map(toSource) };
}
export async function addSource(name: string) {
  const k = newKey();
  const r = await (await db()).collection('enqsources').insertOne({ name, keyHash: k.keyHash, keyHint: k.keyHint, active: true, notify: true, autoReply: false, count: 0, createdAt: new Date() });
  return { id: String(r.insertedId), key: k.key };
}
/** A new key replaces the old one at once; the full key is shown only now. */
export async function rotateKey(id: string) {
  const k = newKey();
  const r = await (await db()).collection('enqsources').updateOne({ _id: new ObjectId(id) }, { $set: { keyHash: k.keyHash, keyHint: k.keyHint } });
  if (!r.matchedCount) throw new HttpError(404, 'Source not found.');
  return { id, key: k.key };
}
export async function sourceLog(id: string) {
  const rows = await (await db()).collection('enqlog').find({ sourceId: id }).sort({ at: -1 }).limit(100).toArray();
  return rows.map((r) => ({ at: (r.at as Date).toISOString(), status: r.status as number, requestId: String(r.requestId ?? ''), result: String(r.result ?? ''), ref: String(r.ref ?? '') }));
}

export async function nextLeadRef() {
  const r = await (await db()).collection<{ _id: string; seq: number }>('counters').findOneAndUpdate({ _id: 'lead' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return `OPP-${String(r?.seq ?? 1).padStart(4, '0')}`;
}

/* ---------- The request format (field names match the website's templates) ---------- */
const s = (max: number) => z.string().trim().max(max).default('');
const n = z.union([z.number(), z.string().trim()]).transform((v, ctx) => {
  if (v === '' || v === null) return 0;
  const x = Number(v); if (!Number.isFinite(x) || x < 0) { ctx.addIssue({ code: 'custom', message: 'must be a number' }); return 0; } return x;
});
const isoDate = z.string().trim().default('').refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'departureDate must be YYYY-MM-DD');
export const requestSchema = z.object({
  requestId: z.string().trim().min(3, 'requestId is required').max(80),
  formType: z.enum(['contact', 'package']).default('contact'),
  channel: z.enum(['form', 'whatsapp']).default('form'),
  firstName: s(80), lastName: s(80), fullName: s(160),
  email: z.string().trim().toLowerCase().max(200).default('').refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'email is not valid'),
  phone: s(40), customerPhone: s(40),
  subjectLabel: s(120), message: s(5000),
  packageId: s(120), packageName: s(200), departureDate: isoDate, numberOfNights: n.default(0), adults: n.default(0), children: n.default(0),
  departureCity: s(120), roomType: s(40), rooms: n.default(0), notes: s(5000),
  submittedAt: s(60), utm: s(300), marketing: z.boolean().default(false),
  page: z.object({ type: z.enum(['service', 'destination', 'package', 'contact', 'other']).default('other'), name: s(200), id: s(160), url: s(500), price: n.default(0), currency: s(8), destination: s(120) }).default({}),
}).superRefine((r, ctx) => {
  if (!(r.fullName || r.firstName)) ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'firstName/lastName or fullName is required' });
  if (!r.email && (r.phone || r.customerPhone).replace(/\D/g, '').length < 7) ctx.addIssue({ code: 'custom', path: ['email'], message: 'email or phone is required' });
  if (r.formType === 'package' && !(r.packageName || r.page.name)) ctx.addIssue({ code: 'custom', path: ['packageName'], message: 'packageName is required for package requests' });
});
export type EnquiryRequest = z.infer<typeof requestSchema>;

export const ROOMS: Record<string, string> = { SGL: 'Single room', DBL: 'Double room', TWN: 'Twin room', TPL: 'Triple room', QUD: 'Quad room', FAM: 'Family room', STE: 'Suite', ANY: 'Not sure, please advise' };
export const roomLabel = (v: string) => (ROOMS[v.toUpperCase()] ? `${ROOMS[v.toUpperCase()]} (${v.toUpperCase()})` : v);
const dmy = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const blankCity = (v: string) => (/^(not specified|n\/a|none|-)$/i.test(v.trim()) ? '' : v.trim());

/** What the opportunity will look like: title, fields and notes. Shared by the API and WhatsApp. */
function shape(r: EnquiryRequest, sourceName: string) {
  const name = (r.fullName || `${r.firstName} ${r.lastName}`).trim();
  const pax = Math.round(r.adults) + Math.round(r.children);
  const city = blankCity(r.departureCity);
  const pkgName = r.packageName || (r.page.type === 'package' ? r.page.name : '');
  const destination = r.page.destination || (r.page.type === 'destination' ? r.page.name : '');
  const returnDate = r.departureDate && r.numberOfNights ? addDays(r.departureDate, Math.round(r.numberOfNights)) : '';
  const budget = r.page.price && r.adults ? Math.round(r.page.price * r.adults) : 0;
  const prefix = sourceName === 'Website' ? 'Website' : sourceName;
  const title = (r.formType === 'package'
    ? `${prefix} package: ${pkgName}${r.departureDate ? `, ${dmy(r.departureDate)}` : ''}${r.adults ? `, ${Math.round(r.adults)} adult${r.adults === 1 ? '' : 's'}` : ''}${r.children ? `, ${Math.round(r.children)} child${r.children === 1 ? '' : 'ren'}` : ''}`
    : `${prefix}: ${r.subjectLabel || 'Enquiry'}${r.page.name && r.page.type !== 'contact' && r.page.name !== r.subjectLabel ? `, ${r.page.name}` : ''}`).slice(0, 150);
  const lines = [
    `${r.channel === 'whatsapp' ? 'WhatsApp' : 'Form'} request ${r.requestId} from ${sourceName}${r.submittedAt ? `, sent ${r.submittedAt}` : ''}`,
    `From: ${name}${r.email ? `, ${r.email}` : ''}${(r.phone || r.customerPhone) ? `, ${r.phone || r.customerPhone}` : ''}`,
    ...(r.formType === 'package' ? [
      `Package: ${pkgName}${r.packageId ? ` (${r.packageId})` : ''}${r.page.price ? `, from ${money(r.page.price)} per person` : ''}`,
      `Departure ${dmy(r.departureDate) || 'not given'}${r.numberOfNights ? `, ${Math.round(r.numberOfNights)} nights (back ${dmy(returnDate)})` : ''}; ${Math.round(r.adults)} adult${r.adults === 1 ? '' : 's'}${r.children ? `, ${Math.round(r.children)} child${r.children === 1 ? '' : 'ren'}` : ''}${city ? `; from ${city}` : ''}${r.roomType ? `; ${r.rooms > 1 ? `${Math.round(r.rooms)} × ` : ''}${roomLabel(r.roomType)}` : ''}`,
    ] : [`Subject: ${r.subjectLabel || '—'}`]),
    ...(r.message ? ['', r.message] : []), ...(r.notes ? ['', `Notes: ${r.notes}`] : []), '',
    `${r.page.url ? `Page: ${r.page.url}` : ''}${r.utm ? `${r.page.url ? ' · ' : ''}Campaign: ${r.utm}` : ''}`,
  ].filter((x, i, a) => !(x === '' && a[i - 1] === ''));
  return {
    name, title, destination: destination || (r.formType === 'package' ? pkgName : ''), travelDate: r.departureDate, pax, budget, notes: lines.join('\n').trim(),
    enquiry: {
      requestId: r.requestId, source: sourceName, channel: r.channel, formType: r.formType, subject: r.subjectLabel, message: r.message,
      page: r.page, packageId: r.packageId, packageName: pkgName, departureDate: r.departureDate, returnDate, nights: Math.round(r.numberOfNights),
      adults: Math.round(r.adults), children: Math.round(r.children), departureCity: city, roomType: r.roomType ? roomLabel(r.roomType) : '', rooms: Math.round(r.rooms),
      notes: r.notes, submittedAt: r.submittedAt, utm: r.utm, budgetEstimated: budget > 0,
    },
  };
}

/** Finds the contact by email or phone (spacing ignored), or creates a customer. */
export async function contactFor(name: string, email: string, phone: string, marketing: boolean, by: string) {
  const contacts = (await db()).collection('contacts');
  const digits = phone.replace(/\D/g, '');
  const byEmail = email ? await contacts.findOne({ email }) : null;
  const byPhone = !byEmail && digits.length >= 7 ? (await contacts.find({ phone: { $regex: digits.slice(-7).split('').join('\\D*') } }).toArray()).find((c) => String(c.phone).replace(/\D/g, '').replace(/^00/, '').endsWith(digits.replace(/^00/, '').slice(-9))) ?? null : null;
  const found = byEmail ?? byPhone;
  if (found) {
    if (marketing && found.marketing !== 'yes') await contacts.updateOne({ _id: found._id }, { $set: { marketing: 'yes' } });
    return { contact: found, matched: true };
  }
  const ins = await contacts.insertOne({ name, type: 'customer', email, phone, city: '', country: '', creditLimit: 0, marketing: marketing ? 'yes' : 'no', portalAccess: 'no', notes: `Created from ${by}.`, createdAt: new Date(), createdBy: by });
  await logActivity('contact', String(ins.insertedId), by, `Contact created from ${by}.`);
  return { contact: (await contacts.findOne({ _id: ins.insertedId }))!, matched: false };
}

/**
 * Creates the opportunity for a request, or recognises one already received with the same ID from the same
 * source (then only notes that it arrived again, for example by WhatsApp after the form).
 */
export async function intake(r: EnquiryRequest, src: { id: string; name: string; notify?: boolean; autoReply?: boolean }, by = src.name) {
  const d = await db();
  const leads = d.collection('leads');
  const existing = await leads.findOne({ 'enquiry.requestId': r.requestId, 'enquiry.sourceId': src.id });
  if (existing) {
    if (existing.enquiry?.channel !== r.channel && !(existing.enquiry?.alsoVia ?? []).includes(r.channel)) {
      await leads.updateOne({ _id: existing._id }, { $push: { 'enquiry.alsoVia': r.channel } as never });
      await logActivity('lead', String(existing._id), by, `Request ${r.requestId} received again via ${r.channel === 'whatsapp' ? 'WhatsApp' : 'the form'}.`);
    }
    return { duplicate: true, id: String(existing._id), ref: String(existing.ref ?? '') };
  }
  const sh = shape(r, src.name);
  const { contact, matched } = await contact4(sh.name, r, by);
  const ref = await nextLeadRef();
  let ins;
  try {
  ins = await leads.insertOne({
    ref, title: sh.title, contactId: String(contact._id), stage: 'new', destination: sh.destination, travelDate: sh.travelDate, pax: sh.pax, budget: sh.budget,
    notes: `${sh.notes}\n${matched ? `Matched to the existing contact ${contact.name}.` : 'New contact created.'}`,
    source: src.name, enquiry: { ...sh.enquiry, sourceId: src.id }, createdAt: new Date(), createdBy: by,
  });
  } catch (e) {
    // The same request arriving twice at the same moment: the unique index keeps one; answer as a duplicate.
    if ((e as { code?: number }).code === 11000) { const x = await leads.findOne({ 'enquiry.requestId': r.requestId, 'enquiry.sourceId': src.id }); if (x) return { duplicate: true, id: String(x._id), ref: String(x.ref ?? '') }; }
    throw e;
  }
  const id = String(ins.insertedId);
  await logActivity('lead', id, by, `Opportunity ${ref} created from ${src.name} request ${r.requestId}.`);
  await notifyAbout(r, sh, src, id, ref);
  return { duplicate: false, id, ref };
}
async function contact4(name: string, r: EnquiryRequest, by: string) { return contactFor(name, r.email, r.phone || r.customerPhone, r.marketing, by); }

async function notifyAbout(r: EnquiryRequest, sh: ReturnType<typeof shape>, src: { notify?: boolean; autoReply?: boolean; name: string }, id: string, ref: string) {
  if (!(src.notify || src.autoReply) || !(await mailReady())) return;
  const base = await appUrl();
  if (src.notify) {
    const to = (await getMailSettings()).notifyTo.split(/[,;\s]+/).filter((x) => x.includes('@'));
    if (to.length) { const m = await layout({ heading: `New enquiry ${ref}: ${sh.title}`, paragraphs: sh.notes.split('\n\n'), button: { text: 'Open in the CRM', url: `${base}/crm/${id}` } }); await sendMail({ to, subject: `${ref}: ${sh.title}`, ...m, kind: 'enquiry', ref: { model: 'lead', id }, replyTo: r.email || undefined }); }
  }
  if (src.autoReply && r.email) {
    const company = (await getCompany()).name || 'our team';
    const m = await layout({ heading: `Thank you, ${sh.name.split(' ')[0]}`, paragraphs: [`We’ve received your request ${r.requestId} and one of our consultants will contact you shortly.`, `Kind regards,\n${company}`] });
    await sendMail({ to: r.email, subject: `We received your request – ${company}`, ...m, kind: 'enquiry-reply', ref: { model: 'lead', id } });
  }
}

/** The API call: key → source, checks, rate limit (120 a minute per source), then intake. Every call is logged. */
export async function receiveFromSource(auth: string | null, body: unknown) {
  const d = await db();
  const key = (auth ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!key) throw new HttpError(401, 'Send the key in the Authorization header: Bearer <key>.');
  const src = await d.collection('enqsources').findOne({ keyHash: hashKey(key) });
  if (!src) throw new HttpError(401, 'That key is not valid.');
  const sid = String(src._id);
  const log = (status: number, result: string, requestId = '', ref = '') => d.collection('enqlog').insertOne({ sourceId: sid, at: new Date(), status, result: result.slice(0, 300), requestId, ref }).catch(() => null);
  if (src.active === false) { await log(403, 'Source switched off'); throw new HttpError(403, 'This source is switched off in the ERP.'); }
  const minute = Math.floor(Date.now() / 60000);
  const r1 = await d.collection<{ _id: string; n: number; expiresAt: Date }>('enqlimits').findOneAndUpdate({ _id: `src:${sid}:${minute}` }, { $inc: { n: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 120000) } }, { upsert: true, returnDocument: 'after' });
  if ((r1?.n ?? 1) > 120) { await log(429, 'Too many requests'); throw Object.assign(new HttpError(429, 'Too many requests. Retry in a minute.'), { retryAfter: 60 }); }
  const parsed = requestSchema.safeParse(body);
  const rid = typeof (body as { requestId?: unknown })?.requestId === 'string' ? String((body as { requestId: string }).requestId) : '';
  if (!parsed.success) { const i = parsed.error.issues[0]; const msg = `${i.path.join('.') || 'request'}: ${i.message}`; await log(400, msg, rid); throw new HttpError(400, msg); }
  const res = await intake(parsed.data, { id: sid, name: src.name, notify: !!src.notify, autoReply: !!src.autoReply });
  await d.collection('enqsources').updateOne({ _id: src._id }, { $inc: { count: res.duplicate ? 0 : 1 }, $set: { lastAt: new Date() } });
  await log(res.duplicate ? 200 : 201, res.duplicate ? 'Duplicate: already received' : 'Opportunity created', parsed.data.requestId, res.ref);
  return res;
}
