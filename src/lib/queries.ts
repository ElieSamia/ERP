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
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ title: rx }, { destination: rx }];
  }
  const docs = await (await db()).collection('leads').find(filter).sort({ createdAt: -1 }).limit(500).toArray();
  return withContactNames(docs.map((d) => out<Lead>(d)));
}

export async function getLead(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('leads').findOne({ _id: oid(id) });
  return d ? (await withContactNames([out<Lead>(d)]))[0] : null;
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
  const docs = await (await db()).collection('users').find({}, { projection: { passwordHash: 0 } }).sort({ name: 1 }).toArray();
  return docs.map((d) => out<StaffUser>(d));
}

export async function needsSetup() {
  return (await (await db()).collection('users').countDocuments({}, { limit: 1 })) === 0;
}
