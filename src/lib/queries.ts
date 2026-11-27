import { db } from './db';
import { oid, escapeRegex } from './api';
import { out } from './serialize';
import type { Activity, Company, Contact, Lead, StaffUser } from './types';
import { ObjectId } from 'mongodb';

export async function listContacts(opts: { q?: string; type?: string; tag?: string; customersOnly?: boolean; limit?: number } = {}) {
  const filter: Record<string, unknown> = {};
  if (opts.q) {
    const rx = { $regex: escapeRegex(opts.q), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { city: rx }];
  }
  if (opts.type && opts.type !== 'all') filter.type = opts.type;
  else if (opts.customersOnly) filter.type = { $ne: 'supplier' };
  if (opts.tag) filter.tags = opts.tag;
  const docs = await (await db()).collection('contacts').find(filter).sort({ name: 1 }).limit(opts.limit ?? 500).toArray();
  return docs.map((d) => out<Contact>(d));
}

export async function getContact(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('contacts').findOne({ _id: oid(id) });
  return d ? out<Contact>(d) : null;
}

async function withContactNames(leads: Lead[]) {
  const ids = [...new Set(leads.map((l) => l.contactId).filter((x) => ObjectId.isValid(x)))].map((x) => new ObjectId(x));
  const contacts = ids.length ? await (await db()).collection('contacts').find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray() : [];
  const names = new Map(contacts.map((c) => [String(c._id), String(c.name)]));
  return leads.map((l) => ({ ...l, contactName: names.get(l.contactId) || 'Unknown customer' }));
}

/** CRM filters, as they appear in the page address so a filtered view can be bookmarked or shared. */
export type LeadFilters = { source?: string; created?: string; travel?: string; ctype?: string; dest?: string; attention?: string; booking?: string; followup?: string };

export async function listLeads(q?: string, f: LeadFilters = {}) {
  const filter: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const plusDays = (n: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const startOf = (unit: 'day' | 'week' | 'month') => { const x = new Date(); x.setUTCHours(0, 0, 0, 0); if (unit === 'week') x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); if (unit === 'month') x.setUTCDate(1); return x; };
  if (f.source === 'website') and.push({ source: 'Website' });
  else if (f.source === 'whatsapp') and.push({ source: 'WhatsApp' });
  else if (f.source === 'portal') and.push({ requestId: { $exists: true, $nin: ['', null] } });
  else if (f.source === 'manual') and.push({ $and: [{ $or: [{ source: { $exists: false } }, { source: '' }] }, { $or: [{ requestId: { $exists: false } }, { requestId: '' }, { requestId: null }] }] });
  else if (f.source) and.push({ source: f.source });
  if (f.created === 'today') and.push({ createdAt: { $gte: startOf('day') } });
  else if (f.created === 'week') and.push({ createdAt: { $gte: startOf('week') } });
  else if (f.created === 'month') and.push({ createdAt: { $gte: startOf('month') } });
  if (f.travel === '30d') and.push({ travelDate: { $gte: today, $lte: plusDays(30) } });
  else if (f.travel === 'month') and.push({ travelDate: { $regex: `^${today.slice(0, 7)}` } });
  else if (f.travel === 'next') { const n = new Date(); n.setUTCDate(1); n.setUTCMonth(n.getUTCMonth() + 1); and.push({ travelDate: { $regex: `^${n.toISOString().slice(0, 7)}` } }); }
  else if (f.travel === 'none') and.push({ $or: [{ travelDate: '' }, { travelDate: { $exists: false } }] });
  if (f.dest) and.push({ destination: { $regex: escapeRegex(f.dest), $options: 'i' } });
  if (f.followup === 'due') and.push({ followUpDate: { $gt: '', $lte: today }, stage: { $nin: ['won', 'lost'] } });
  else if (f.followup === 'week') and.push({ followUpDate: { $gt: '', $lte: plusDays(7) }, stage: { $nin: ['won', 'lost'] } });
  if (f.booking === 'yes') and.push({ bookingId: { $exists: true, $nin: ['', null] } });
  else if (f.booking === 'no') and.push({ $or: [{ bookingId: { $exists: false } }, { bookingId: '' }, { bookingId: null }] });
  // Needs attention: new for more than a day, or travelling within two weeks and still open.
  if (f.attention) and.push({ $or: [{ stage: 'new', createdAt: { $lt: new Date(Date.now() - 864e5) } }, { stage: { $nin: ['won', 'lost'] }, travelDate: { $gte: today, $lte: plusDays(14) } }] });
  if (f.ctype) {
    const ids = await (await db()).collection('contacts').find({ type: f.ctype }, { projection: { _id: 1 } }).toArray();
    and.push({ contactId: { $in: ids.map((c) => String(c._id)) } });
  }
  if (q) {
    const rx = { $regex: escapeRegex(q.trim()), $options: 'i' };
    // Also find opportunities by their customer (name, email, phone with or without spaces) and by their notes,
    // which hold website enquiry IDs like REQ-20261120-…
    const digits = q.replace(/\D/g, '');
    const phone = digits.length >= 5 ? { $regex: digits.split('').join('\\D*') } : null;
    const contacts = await (await db()).collection('contacts').find({ $or: [{ name: rx }, { email: rx }, ...(phone ? [{ phone }] : [])] }, { projection: { _id: 1 } }).limit(500).toArray();
    and.push({ $or: [{ title: rx }, { destination: rx }, { notes: rx }, ...(contacts.length ? [{ contactId: { $in: contacts.map((c) => String(c._id)) } }] : [])] });
  }
  if (and.length) filter.$and = and;
  const docs = await (await db()).collection('leads').find(filter).sort({ createdAt: -1 }).limit(500).toArray();
  return withContactNames(docs.map((d) => out<Lead>(d)));
}

export async function getLead(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('leads').findOne({ _id: oid(id) });
  if (!d) return null;
  const lead = (await withContactNames([out<Lead>(d)]))[0];
  if (lead.bookingId && ObjectId.isValid(lead.bookingId)) {
    const b = await (await db()).collection('bookings').findOne({ _id: new ObjectId(lead.bookingId) }, { projection: { ref: 1 } });
    lead.bookingRef = b ? String(b.ref) : undefined;
    if (!b) lead.bookingId = undefined;
  }
  return lead;
}

export async function getActivity(model: string, recordId: string) {
  const docs = await (await db()).collection('activity').find({ model, recordId }).sort({ at: -1 }).limit(200).toArray();
  return docs.map((d) => out<Activity>(d));
}

export const EMPTY_COMPANY: Company = { name: '', address: '', phone: '', email: '', financialNo: '', vatNo: '', commercialReg: '' };

export async function getCompany(): Promise<Company> {
  const d = await (await db()).collection<{ _id: string } & Company>('settings').findOne({ _id: 'company' });
  if (!d) return EMPTY_COMPANY;
  const { _id, ...rest } = d;
  void _id;
  return { ...EMPTY_COMPANY, ...rest };
}

export async function listUsers() {
  // Never send passwords, two-step secrets or recovery codes to the browser, encrypted or not.
  const docs = await (await db()).collection('users').find({}, { projection: { passwordHash: 0, totpEnc: 0, totpPendingEnc: 0, recoveryHashes: 0, totpLastStep: 0 } }).sort({ name: 1 }).toArray();
  return docs.map(({ totpEnabled, failedLogins, lockedUntil, ...d }) => { void failedLogins; void lockedUntil; return { ...out<StaffUser>(d as typeof docs[number]), twoStep: !!totpEnabled }; });
}

export async function needsSetup() {
  return (await (await db()).collection('users').countDocuments({}, { limit: 1 })) === 0;
}
