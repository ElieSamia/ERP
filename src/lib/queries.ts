import { db } from './db';
import { oid, escapeRegex } from './api';
import { out } from './serialize';
import type { Activity, Company, Contact, Lead, StaffUser } from './types';
import { ObjectId } from 'mongodb';

export async function listContacts(opts: { q?: string; type?: string; customersOnly?: boolean; limit?: number } = {}) {
  const filter: Record<string, unknown> = {};
  if (opts.q) {
    const rx = { $regex: escapeRegex(opts.q), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { city: rx }];
  }
  if (opts.type && opts.type !== 'all') filter.type = opts.type;
  else if (opts.customersOnly) filter.type = { $ne: 'supplier' };
  const docs = await (await db()).collection('contacts').find(filter).sort({ name: 1 }).limit(opts.limit ?? 200).toArray();
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

export async function listLeads(q?: string) {
  const filter: Record<string, unknown> = {};
  if (q) {
    const rx = { $regex: escapeRegex(q.trim()), $options: 'i' };
    // Also find opportunities by their customer (name, email, phone with or without spaces) and by their notes,
    // which hold website enquiry IDs like REQ-20261120-…
    const digits = q.replace(/\D/g, '');
    const phone = digits.length >= 5 ? { $regex: digits.split('').join('\\D*') } : null;
    const contacts = await (await db()).collection('contacts').find({ $or: [{ name: rx }, { email: rx }, ...(phone ? [{ phone }] : [])] }, { projection: { _id: 1 } }).limit(500).toArray();
    filter.$or = [{ title: rx }, { destination: rx }, { notes: rx }, ...(contacts.length ? [{ contactId: { $in: contacts.map((c) => String(c._id)) } }] : [])];
  }
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
