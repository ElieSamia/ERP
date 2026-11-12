import { ObjectId, type Document, type WithId } from 'mongodb';
import { db } from './db';
import { escapeRegex, HttpError, oid } from './api';
import { totals, docTotals, CHANNEL, DEFAULT_PRICING, type Pricing } from './constants';
import type { Booking, BookingDoc, Option } from './types';

/** Booking numbers come from a counter, so two people saving at the same moment never get the same number. */
export async function nextBookingRef() {
  const r = await (await db()).collection<{ _id: string; seq: number }>('counters').findOneAndUpdate(
    { _id: 'booking' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' },
  );
  return `BK-${String(r?.seq ?? 1).padStart(4, '0')}`;
}

/** Shapes a booking for the browser. File storage paths never leave the server. */
export function toBooking(d: WithId<Document>): Booking {
  const docs = ((d.docs as (BookingDoc & { pathname?: string; url?: string })[]) || []).map((x) => ({
    id: x.id, kind: x.kind, traveller: x.traveller || '', name: x.name, size: x.size, type: x.type, at: x.at, by: x.by, shared: x.shared === 'no' ? 'no' : 'yes',
  })) as BookingDoc[];
  return {
    id: String(d._id), ref: d.ref, contactId: d.contactId, tripType: d.tripType || 'return', bookingDate: d.bookingDate || '',
    origin: d.origin || '', destination: d.destination || '', destinationName: d.destinationName || '', departDate: d.departDate || '',
    returnDate: d.returnDate || '', travellers: d.travellers || '', status: d.status, lines: d.lines || [], tripNotes: d.tripNotes || '',
    notes: d.notes || '', docs, leadId: d.leadId || undefined,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
  };
}


async function decorate(list: Booking[]) {
  const d = await db();
  const cids = [...new Set(list.map((b) => b.contactId).filter((x) => ObjectId.isValid(x)))].map((x) => new ObjectId(x));
  const cs = cids.length ? await d.collection('contacts').find({ _id: { $in: cids } }, { projection: { name: 1, type: 1 } }).toArray() : [];
  const cmap = new Map(cs.map((c) => [String(c._id), c]));
  const lids = [...new Set(list.map((b) => b.leadId).filter((x): x is string => !!x && ObjectId.isValid(x)))].map((x) => new ObjectId(x));
  const ls = lids.length ? await d.collection('leads').find({ _id: { $in: lids } }, { projection: { title: 1 } }).toArray() : [];
  const lmap = new Map(ls.map((l) => [String(l._id), String(l.title)]));
  const bids = list.map((b) => b.id);
  const invs = await d.collection('invoices').find({ bookingId: { $in: bids } }, { projection: { number: 1, bookingId: 1 } }).toArray();
  const imap = new Map(invs.map((i) => [String(i.bookingId), { id: String(i._id), number: i.number ? String(i.number) : 'Draft invoice' }]));
  const pos = await d.collection('purchases').find({ bookingId: { $in: bids } }, { projection: { ref: 1, status: 1, bookingId: 1 } }).toArray();
  return list.map((b) => ({
    ...b,
    invoiceId: imap.get(b.id)?.id,
    invoiceNumber: imap.get(b.id)?.number,
    purchases: pos.filter((p) => String(p.bookingId) === b.id).map((p) => ({ id: String(p._id), ref: String(p.ref), status: String(p.status) })),
    contactName: cmap.get(b.contactId)?.name ?? 'Unknown customer',
    contactType: cmap.get(b.contactId)?.type ?? 'customer',
    leadTitle: b.leadId ? lmap.get(b.leadId) : undefined,
  }));
}

export async function getBooking(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('bookings').findOne({ _id: new ObjectId(id) });
  return d ? (await decorate([toBooking(d)]))[0] : null;
}

export async function listBookings(opts: { q?: string; status?: string } = {}) {
  const filter: Record<string, unknown> = {};
  if (opts.status && opts.status !== 'all') filter.status = opts.status;
  if (opts.q) {
    const rx = { $regex: escapeRegex(opts.q), $options: 'i' };
    const d = await db();
    const cs = await d.collection('contacts').find({ name: rx }, { projection: { _id: 1 } }).limit(200).toArray();
    filter.$or = [{ ref: rx }, { destinationName: rx }, { destination: rx }, { travellers: rx }, { contactId: { $in: cs.map((c) => String(c._id)) } }];
  }
  const docs = await (await db()).collection('bookings').find(filter).sort({ createdAt: -1 }).limit(500).toArray();
  return decorate(docs.map(toBooking));
}

export async function listSuppliers(): Promise<Option[]> {
  const cs = await (await db()).collection('contacts').find({ type: 'supplier' }, { projection: { name: 1 } }).sort({ name: 1 }).toArray();
  return cs.map((c) => ({ id: String(c._id), name: String(c.name) }));
}

export async function getPricing(): Promise<Pricing> {
  const d = await (await db()).collection<{ _id: string } & Partial<Pricing>>('settings').findOne({ _id: 'pricing' });
  return {
    B2C: d?.B2C ?? DEFAULT_PRICING.B2C, B2B: d?.B2B ?? DEFAULT_PRICING.B2B, Corporate: d?.Corporate ?? DEFAULT_PRICING.Corporate,
    modes: { ...DEFAULT_PRICING.modes, ...(d?.modes || {}) },
  };
}

export async function channelRate(contactType: string) {
  const p = await getPricing();
  const ch = CHANNEL[contactType] ?? 'B2C';
  return { markup: p[ch], markupType: p.modes[ch] };
}

/** Money committed by an account: unpaid posted invoices plus confirmed or ticketed bookings not yet invoiced. */
export async function exposure(contactId: string, excludeId?: string) {
  const d = await db();
  const filter: Record<string, unknown> = { contactId, status: { $in: ['confirmed', 'ticketed'] } };
  if (excludeId) filter._id = { $ne: oid(excludeId) };
  const list = await d.collection('bookings').find(filter, { projection: { lines: 1 } }).toArray();
  const open = list.reduce((s, b) => s + totals(b.lines || []).total, 0);
  const invs = await d.collection('invoices').find({ contactId, status: 'posted' }, { projection: { lines: 1, payments: 1 } }).toArray();
  const due = invs.reduce((s, i) => s + docTotals(i.lines || [], i.payments || []).balance, 0);
  return open + due;
}

/** Checks the customer and that every supplier on the services really is a supplier. */
export async function checkReferences(contactId: string, supplierIds: string[]) {
  const d = await db();
  const c = await d.collection('contacts').findOne({ _id: oid(contactId) });
  if (!c || c.type === 'supplier') throw new HttpError(400, 'Choose a customer, agency or corporate account.');
  const ids = [...new Set(supplierIds.filter(Boolean))];
  if (ids.length) {
    if (ids.some((x) => !ObjectId.isValid(x))) throw new HttpError(400, 'One of the suppliers no longer exists. Choose it again.');
    const n = await d.collection('contacts').countDocuments({ _id: { $in: ids.map((x) => new ObjectId(x)) }, type: 'supplier' });
    if (n !== ids.length) throw new HttpError(400, 'One of the suppliers no longer exists. Choose it again.');
  }
  return c;
}
