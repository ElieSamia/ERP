import { randomUUID } from 'crypto';
import { ObjectId, type Document, type WithId } from 'mongodb';
import { db } from './db';
import { escapeRegex, HttpError, oid } from './api';
import { DEFAULT_FINANCE, type Finance, docTotals, sell, todayISO, type MarkupType } from './constants';
import { logActivity } from './activity';
import type { Expense, Invoice, Payment, Purchase, TaxLine } from './types';

/* ---------- Settings and numbering ---------- */
export async function getFinance(): Promise<Finance> {
  const d = await (await db()).collection<{ _id: string } & Partial<Finance>>('settings').findOne({ _id: 'finance' });
  return {
    terms: { ...DEFAULT_FINANCE.terms, ...(d?.terms || {}) },
    supplierTerms: d?.supplierTerms ?? DEFAULT_FINANCE.supplierTerms,
    vat: { ...DEFAULT_FINANCE.vat, ...(d?.vat || {}) },
    accounts: d?.accounts?.length ? d.accounts : DEFAULT_FINANCE.accounts,
    categories: d?.categories?.length ? d.categories : DEFAULT_FINANCE.categories,
    autoPO: d?.autoPO ?? DEFAULT_FINANCE.autoPO,
  };
}

/** Atomic running numbers, safe when two people save at the same moment. */
export async function nextNumber(key: string) {
  const r = await (await db()).collection<{ _id: string; seq: number }>('counters').findOneAndUpdate(
    { _id: key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' },
  );
  return r?.seq ?? 1;
}
const pad = (n: number) => String(n).padStart(4, '0');

/* ---------- Mapping documents for the browser ---------- */
const lines = (x: unknown) => ((x as TaxLine[]) || []).map((l) => ({ id: l.id, type: l.type, desc: l.desc || '', amount: Number(l.amount) || 0, vat: Number(l.vat) || 0 }));
const pays = (x: unknown) => ((x as Payment[]) || []).map((p) => ({ id: p.id, ref: p.ref, date: p.date, amount: Number(p.amount) || 0, method: p.method, accountId: p.accountId, by: p.by }));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | undefined));

export const toInvoice = (d: WithId<Document>): Invoice => ({
  id: String(d._id), number: d.number ?? null, contactId: d.contactId, bookingId: d.bookingId || undefined, date: d.date, dueDate: d.dueDate,
  status: d.status, lines: lines(d.lines), payments: pays(d.payments), notes: d.notes || '', createdAt: iso(d.createdAt),
});
export const toPurchase = (d: WithId<Document>): Purchase => ({
  id: String(d._id), ref: d.ref, supplierId: d.supplierId, bookingId: d.bookingId || undefined, orderDate: d.orderDate, billRef: d.billRef || '',
  billDate: d.billDate || '', status: d.status, lines: lines(d.lines), payments: pays(d.payments), notes: d.notes || '', ack: d.ack || undefined, createdAt: iso(d.createdAt),
});
export const toExpense = (d: WithId<Document>): Expense => ({
  id: String(d._id), ref: d.ref, date: d.date, description: d.description, categoryId: d.categoryId, amount: Number(d.amount) || 0, vat: Number(d.vat) || 0,
  paidFrom: d.paidFrom, supplierId: d.supplierId || '', reference: d.reference || '', status: d.status, notes: d.notes || '', createdAt: iso(d.createdAt),
});

async function names(ids: string[]) {
  const valid = [...new Set(ids.filter((x) => x && ObjectId.isValid(x)))].map((x) => new ObjectId(x));
  const cs = valid.length ? await (await db()).collection('contacts').find({ _id: { $in: valid } }, { projection: { name: 1 } }).toArray() : [];
  return new Map(cs.map((c) => [String(c._id), String(c.name)]));
}
async function refs(ids: string[]) {
  const valid = [...new Set(ids.filter((x) => x && ObjectId.isValid(x)))].map((x) => new ObjectId(x));
  const bs = valid.length ? await (await db()).collection('bookings').find({ _id: { $in: valid } }, { projection: { ref: 1 } }).toArray() : [];
  return new Map(bs.map((b) => [String(b._id), String(b.ref)]));
}

/* ---------- Invoices ---------- */
export async function listInvoices(opts: { q?: string; status?: string } = {}) {
  const filter: Record<string, unknown> = {};
  if (opts.status && opts.status !== 'all') filter.status = opts.status;
  if (opts.q) {
    const rx = { $regex: escapeRegex(opts.q), $options: 'i' };
    const cs = await (await db()).collection('contacts').find({ name: rx }, { projection: { _id: 1 } }).limit(200).toArray();
    filter.$or = [{ number: rx }, { contactId: { $in: cs.map((c) => String(c._id)) } }];
  }
  const list = (await (await db()).collection('invoices').find(filter).sort({ createdAt: -1 }).limit(500).toArray()).map(toInvoice);
  const [n, r] = await Promise.all([names(list.map((i) => i.contactId)), refs(list.map((i) => i.bookingId || ''))]);
  return list.map((i) => ({ ...i, contactName: n.get(i.contactId) ?? 'Unknown customer', bookingRef: i.bookingId ? r.get(i.bookingId) : undefined }));
}
export async function getInvoice(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('invoices').findOne({ _id: new ObjectId(id) });
  if (!d) return null;
  const i = toInvoice(d);
  const [n, r] = await Promise.all([names([i.contactId]), refs([i.bookingId || ''])]);
  return { ...i, contactName: n.get(i.contactId) ?? 'Unknown customer', bookingRef: i.bookingId ? r.get(i.bookingId) : undefined };
}

/** Creates a draft invoice from a confirmed or ticketed booking, with VAT per service type from Settings. */
export async function invoiceFromBooking(bookingId: string, by: string) {
  const d = await db();
  const b = await d.collection('bookings').findOne({ _id: oid(bookingId) });
  if (!b) throw new HttpError(404, 'Booking not found.');
  if (b.invoiceId) throw new HttpError(409, 'This booking already has an invoice.');
  if (!['confirmed', 'ticketed'].includes(b.status)) throw new HttpError(409, 'Confirm the booking before invoicing it.');
  const [fin, c] = await Promise.all([getFinance(), d.collection('contacts').findOne({ _id: oid(b.contactId) })]);
  const terms = c?.type === 'corporate' ? fin.terms.corporate : c?.type === 'agency' ? fin.terms.agency : fin.terms.customer;
  const date = todayISO();
  const due = new Date(date + 'T00:00:00Z'); due.setUTCDate(due.getUTCDate() + terms);
  const svcLabel: Record<string, string> = { flight: 'Flight', hotel: 'Hotel', transfer: 'Transfer', visa: 'Visa', package: 'Package', insurance: 'Insurance', other: 'Service' };
  const invLines = ((b.lines as { id: string; type: keyof Finance['vat']; desc: string; cost: number; markup: number; markupType?: MarkupType }[]) || []).map((l) => ({
    id: randomUUID(), type: l.type, desc: `${svcLabel[l.type] ?? 'Service'}: ${l.desc}`,
    amount: sell(l), vat: fin.vat[l.type] ?? 11,
  }));
  const r = await d.collection('invoices').insertOne({
    number: null, contactId: b.contactId, bookingId, date, dueDate: due.toISOString().slice(0, 10), status: 'draft',
    lines: invLines, payments: [], notes: '', createdAt: new Date(), createdBy: by,
  });
  const id = String(r.insertedId);
  await d.collection('bookings').updateOne({ _id: oid(bookingId) }, { $set: { invoiceId: id, prevStatus: b.status, status: 'invoiced' } });
  await logActivity('booking', bookingId, by, 'Draft invoice created. Booking marked as invoiced.');
  await logActivity('invoice', id, by, `Draft invoice created from booking ${b.ref}.`);
  return id;
}
export async function invoiceNumber(date: string) {
  const y = date.slice(0, 4);
  return `INV/${y}/${pad(await nextNumber(`invoice-${y}`))}`;
}
export async function receiptNumber() { return `RC-${pad(await nextNumber('receipt'))}`; }
export async function voucherNumber() { return `PV-${pad(await nextNumber('voucher'))}`; }

/* ---------- Purchases ---------- */
export async function listPurchases(opts: { q?: string; status?: string; bookingId?: string } = {}) {
  const filter: Record<string, unknown> = {};
  if (opts.status && opts.status !== 'all') filter.status = opts.status;
  if (opts.bookingId) filter.bookingId = opts.bookingId;
  if (opts.q) {
    const rx = { $regex: escapeRegex(opts.q), $options: 'i' };
    const cs = await (await db()).collection('contacts').find({ name: rx }, { projection: { _id: 1 } }).limit(200).toArray();
    filter.$or = [{ ref: rx }, { billRef: rx }, { supplierId: { $in: cs.map((c) => String(c._id)) } }];
  }
  const list = (await (await db()).collection('purchases').find(filter).sort({ createdAt: -1 }).limit(500).toArray()).map(toPurchase);
  const [n, r] = await Promise.all([names(list.map((p) => p.supplierId)), refs(list.map((p) => p.bookingId || ''))]);
  return list.map((p) => ({ ...p, supplierName: n.get(p.supplierId) ?? 'Not set', bookingRef: p.bookingId ? r.get(p.bookingId) : undefined }));
}
export async function getPurchase(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('purchases').findOne({ _id: new ObjectId(id) });
  if (!d) return null;
  const p = toPurchase(d);
  const [n, r] = await Promise.all([names([p.supplierId]), refs([p.bookingId || ''])]);
  return { ...p, supplierName: n.get(p.supplierId) ?? 'Not set', bookingRef: p.bookingId ? r.get(p.bookingId) : undefined };
}
export async function newPurchaseRef() { return `PO-${pad(await nextNumber('purchase'))}`; }

/** One draft purchase order per supplier, for booking services that have a supplier and a cost and no order yet. */
export async function purchasesFromBooking(bookingId: string, by: string) {
  const d = await db();
  const b = await d.collection('bookings').findOne({ _id: oid(bookingId) });
  if (!b) throw new HttpError(404, 'Booking not found.');
  const all = (b.lines as { id: string; type: keyof Finance['vat']; desc: string; supplierId: string; cost: number; poId?: string }[]) || [];
  const groups = new Map<string, typeof all>();
  for (const l of all) if (!l.poId && l.supplierId && Number(l.cost) > 0) groups.set(l.supplierId, [...(groups.get(l.supplierId) || []), l]);
  const made: string[] = [];
  for (const [supplierId, ls] of groups) {
    const ref = await newPurchaseRef();
    const r = await d.collection('purchases').insertOne({
      ref, supplierId, bookingId, orderDate: todayISO(), billRef: '', billDate: '', status: 'draft', notes: '',
      lines: ls.map((l) => ({ id: randomUUID(), type: l.type, desc: `${b.ref}: ${l.desc}`, amount: Number(l.cost) || 0, vat: 0 })),
      payments: [], createdAt: new Date(), createdBy: by,
    });
    const pid = String(r.insertedId);
    const set: Record<string, string> = {};
    all.forEach((l, i) => { if (ls.includes(l)) set[`lines.${i}.poId`] = pid; });
    await d.collection('bookings').updateOne({ _id: oid(bookingId) }, { $set: set });
    await logActivity('purchase', pid, by, `Created from booking ${b.ref}.`);
    made.push(ref);
  }
  if (made.length) await logActivity('booking', bookingId, by, `Purchase order${made.length > 1 ? 's' : ''} ${made.join(', ')} created.`);
  return made;
}

/* ---------- Expenses ---------- */
export async function listExpenses(opts: { q?: string; status?: string } = {}) {
  const filter: Record<string, unknown> = {};
  if (opts.status && opts.status !== 'all') filter.status = opts.status;
  if (opts.q) { const rx = { $regex: escapeRegex(opts.q), $options: 'i' }; filter.$or = [{ description: rx }, { reference: rx }, { ref: rx }]; }
  const list = (await (await db()).collection('expenses').find(filter).sort({ date: -1, createdAt: -1 }).limit(500).toArray()).map(toExpense);
  const n = await names(list.map((e) => e.supplierId));
  return list.map((e) => ({ ...e, supplierName: e.supplierId ? n.get(e.supplierId) : undefined }));
}
export async function getExpense(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('expenses').findOne({ _id: new ObjectId(id) });
  if (!d) return null;
  const e = toExpense(d);
  const n = await names([e.supplierId]);
  return { ...e, supplierName: e.supplierId ? n.get(e.supplierId) : undefined };
}

/** Checks that a payment account id exists in Settings. */
export async function checkAccount(accountId: string) {
  const fin = await getFinance();
  if (!fin.accounts.some((a) => a.id === accountId)) throw new HttpError(400, 'Choose one of the bank, cash or wallet accounts.');
  return fin;
}
export { docTotals };

/** Checks an expense's category, payment account and vendor against Settings and Contacts. */
export async function checkExpense(data: { categoryId: string; paidFrom: string; supplierId: string }) {
  const fin = await getFinance();
  if (!fin.categories.some((c) => c.id === data.categoryId)) throw new HttpError(400, 'Choose a category.');
  if (data.paidFrom !== 'supplier' && !fin.accounts.some((a) => a.id === data.paidFrom)) throw new HttpError(400, 'Choose how it was paid.');
  if (data.paidFrom === 'supplier' && !data.supplierId) throw new HttpError(400, 'Choose the vendor you’ll pay later.');
  if (data.supplierId) {
    const s = await (await db()).collection('contacts').findOne({ _id: oid(data.supplierId) });
    if (!s || s.type !== 'supplier') throw new HttpError(400, 'Choose a supplier as the vendor.');
  }
}


