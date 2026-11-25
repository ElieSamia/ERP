import { randomUUID } from 'crypto';
import { ObjectId, type Document, type WithId } from 'mongodb';
import { db } from './db';
import { HttpError } from './api';
import { logActivity } from './activity';
import { nextNumber } from './finance';
import { docTotals, money, r2 } from './constants';
import type { CreditNote, Payment, TaxLine } from './types';

/**
 * Credit notes, refunds and cancelled payments, for customers (invoices) and suppliers (purchase orders).
 *  - A credit note cancels all or part of a posted invoice (or a supplier bill). It is applied first to that
 *    document's unpaid balance; what remains is credit that can be refunded or applied to another document.
 *  - A refund pays credit back (to the customer), or records money received back (from a supplier).
 *  - Cancelling a payment or a refund keeps it listed, marked cancelled, and reverses it in the books.
 */
type Side = 'customer' | 'supplier';
const COL: Record<Side, string> = { customer: 'invoices', supplier: 'purchases' };
const OPEN: Record<Side, string[]> = { customer: ['posted', 'paid'], supplier: ['billed', 'paid'] };
const UNPAID: Record<Side, string> = { customer: 'posted', supplier: 'billed' };
const MODEL: Record<Side, 'invoice' | 'purchase'> = { customer: 'invoice', supplier: 'purchase' };
const pad = (n: number) => String(n).padStart(4, '0');
const refOf = (side: Side, d: Document) => String(side === 'customer' ? d.number : d.billRef || d.ref);
const partnerOf = (side: Side, d: Document) => String(side === 'customer' ? d.contactId : d.supplierId);
const curOf = (d: Document) => ({ currency: String(d.currency || 'USD'), rate: Number(d.rate) || 1 });

export function toCredit(d: WithId<Document>): CreditNote {
  const total = docTotals(d.lines || []).total;
  const allocated = r2(((d.allocations as { amount: number }[]) || []).reduce((s, a) => s + a.amount, 0));
  const refunded = r2(((d.refunds as Payment[]) || []).filter((r) => !r.cancelled).reduce((s, r) => s + r.amount, 0));
  return {
    id: String(d._id), number: d.number, side: d.side, docId: d.docId, docRef: d.docRef, partnerId: d.partnerId, date: d.date, currency: d.currency || 'USD', rate: Number(d.rate) || 1,
    lines: d.lines || [], reason: d.reason || '', theirRef: d.theirRef || '', total, allocated, refunded, available: r2(total - allocated - refunded),
    allocations: d.allocations || [], refunds: d.refunds || [], createdBy: d.createdBy || '', createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : undefined,
  };
}
export async function getCredit(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('credits').findOne({ _id: new ObjectId(id) });
  return d ? toCredit(d) : null;
}
export async function listCredits(f: { docId?: string; partnerId?: string; side?: Side } = {}) {
  const q: Record<string, unknown> = {};
  if (f.docId) q.$or = [{ docId: f.docId }, { 'allocations.docId': f.docId }];
  if (f.partnerId) q.partnerId = f.partnerId;
  if (f.side) q.side = f.side;
  return (await (await db()).collection('credits').find(q).sort({ createdAt: -1 }).limit(500).toArray()).map(toCredit);
}

/** Recomputes a document's status from its balance (paid, or back to posted/billed). */
async function settle(side: Side, docId: ObjectId) {
  const col = (await db()).collection(COL[side]);
  const d = await col.findOne({ _id: docId });
  if (!d) return;
  const bal = docTotals(d.lines || [], d.payments || []).balance;
  await col.updateOne({ _id: docId }, { $set: { status: bal <= 0.004 ? 'paid' : UNPAID[side] } });
}

/** Applies credit to a document, as a "credit applied" entry in its payments (the books use the credit note itself). */
async function applyTo(side: Side, credit: WithId<Document>, target: WithId<Document>, amount: number, date: string, by: string) {
  const d = await db();
  const pay: Payment = { id: randomUUID(), ref: String(credit.number), date, amount: r2(amount), method: 'credit', accountId: '', by, creditId: String(credit._id) };
  await d.collection(COL[side]).updateOne({ _id: target._id }, { $push: { payments: pay } } as never);
  await d.collection('credits').updateOne({ _id: credit._id }, { $push: { allocations: { docId: String(target._id), ref: refOf(side, target), amount: r2(amount), date } } } as never);
  await settle(side, target._id);
}

export async function createCredit(side: Side, docId: string, input: { date: string; lines: TaxLine[]; reason: string; theirRef: string }, by: string) {
  const d = await db();
  if (!ObjectId.isValid(docId)) throw new HttpError(404, 'Document not found.');
  const doc = await d.collection(COL[side]).findOne({ _id: new ObjectId(docId) });
  if (!doc) throw new HttpError(404, 'Document not found.');
  if (!OPEN[side].includes(String(doc.status))) throw new HttpError(409, side === 'customer' ? 'Only posted invoices can be credited. A draft can simply be changed.' : 'Only a recorded supplier bill can be credited.');
  const total = docTotals(input.lines).total;
  if (total <= 0) throw new HttpError(400, 'The credit note must be for more than zero.');
  const docTotal = docTotals(doc.lines || []).total;
  const already = r2((await d.collection('credits').find({ docId, side }).toArray()).reduce((s, c) => s + docTotals(c.lines || []).total, 0));
  const { currency, rate } = curOf(doc);
  if (r2(already + total) > docTotal + 0.004) throw new HttpError(400, `That’s more than can be credited: ${money(r2(docTotal - already), currency)} of this ${side === 'customer' ? 'invoice' : 'bill'} is left to credit.`);
  if (input.date < String(side === 'customer' ? doc.date : doc.billDate || doc.orderDate)) throw new HttpError(400, 'The credit note can’t be dated before the document it credits.');
  const y = input.date.slice(0, 4);
  const number = side === 'customer' ? `CN/${y}/${pad(await nextNumber(`credit-${y}`))}` : `SCN-${pad(await nextNumber('supcredit'))}`;
  const ins = await d.collection('credits').insertOne({
    number, side, docId, docRef: refOf(side, doc), partnerId: partnerOf(side, doc), date: input.date, currency, rate, lines: input.lines, reason: input.reason, theirRef: input.theirRef,
    allocations: [], refunds: [], createdAt: new Date(), createdBy: by,
  });
  const credit = (await d.collection('credits').findOne({ _id: ins.insertedId }))!;
  const open = docTotals(doc.lines || [], doc.payments || []).balance;
  const applied = r2(Math.min(total, Math.max(0, open)));
  if (applied > 0) await applyTo(side, credit, doc, applied, input.date, by);
  await logActivity(MODEL[side], docId, by, `Credit note ${number} for ${money(total, currency)}: ${input.reason}${applied ? `. ${money(applied, currency)} applied to this ${side === 'customer' ? 'invoice' : 'bill'}` : ''}${total - applied > 0.004 ? `; ${money(r2(total - applied), currency)} available to refund or apply elsewhere` : ''}.`);
  return getCredit(String(ins.insertedId));
}

/** Applies remaining credit to another open document of the same partner and currency. */
export async function allocateCredit(id: string, targetId: string, amount: number, by: string) {
  const d = await db();
  const c = ObjectId.isValid(id) ? await d.collection('credits').findOne({ _id: new ObjectId(id) }) : null;
  if (!c) throw new HttpError(404, 'Credit note not found.');
  const side = c.side as Side, cn = toCredit(c);
  const t = ObjectId.isValid(targetId) ? await d.collection(COL[side]).findOne({ _id: new ObjectId(targetId) }) : null;
  if (!t || partnerOf(side, t) !== cn.partnerId) throw new HttpError(400, 'Choose an open document of the same customer or supplier.');
  if (curOf(t).currency !== cn.currency) throw new HttpError(400, `This credit is in ${cn.currency}; the document is in ${curOf(t).currency}.`);
  if (String(t.status) !== UNPAID[side]) throw new HttpError(409, 'That document has nothing left to pay.');
  const open = docTotals(t.lines || [], t.payments || []).balance;
  if (amount > cn.available + 0.004) throw new HttpError(400, `Only ${money(cn.available, cn.currency)} of this credit is left.`);
  if (amount > open + 0.004) throw new HttpError(400, `Only ${money(open, cn.currency)} is due on ${refOf(side, t)}.`);
  await applyTo(side, c, t, amount, new Date().toISOString().slice(0, 10), by);
  await logActivity(MODEL[side], String(t._id), by, `Credit note ${cn.number}: ${money(amount, cn.currency)} applied.`);
  return getCredit(id);
}

/** Money back: paid to the customer, or received from the supplier. Up to the credit still available. */
export async function refundCredit(id: string, input: { date: string; amount: number; method: string; accountId: string }, by: string) {
  const d = await db();
  const c = ObjectId.isValid(id) ? await d.collection('credits').findOne({ _id: new ObjectId(id) }) : null;
  if (!c) throw new HttpError(404, 'Credit note not found.');
  const cn = toCredit(c);
  if (input.amount > cn.available + 0.004) throw new HttpError(400, `Only ${money(cn.available, cn.currency)} of this credit is available to refund.`);
  if (input.date < cn.date) throw new HttpError(400, 'The refund can’t be dated before the credit note.');
  const ref = cn.side === 'customer' ? `RF-${pad(await nextNumber('refund'))}` : `SR-${pad(await nextNumber('suprefund'))}`;
  const r: Payment = { id: randomUUID(), ref, date: input.date, amount: r2(input.amount), method: input.method, accountId: input.accountId, by };
  await d.collection('credits').updateOne({ _id: c._id }, { $push: { refunds: r } } as never);
  await logActivity(MODEL[cn.side], cn.docId, by, `${cn.side === 'customer' ? 'Refund' : 'Refund received'} ${ref}: ${money(r.amount, cn.currency)} on credit note ${cn.number}.`);
  return getCredit(id);
}

export async function cancelRefund(id: string, refundId: string, reason: string, by: string) {
  const d = await db();
  const c = ObjectId.isValid(id) ? await d.collection('credits').findOne({ _id: new ObjectId(id) }) : null;
  const r = (c?.refunds as Payment[] | undefined)?.find((x) => x.id === refundId);
  if (!c || !r) throw new HttpError(404, 'Refund not found.');
  if (r.cancelled) throw new HttpError(409, 'This refund is already cancelled.');
  await d.collection('credits').updateOne({ _id: c._id, 'refunds.id': refundId }, { $set: { 'refunds.$.cancelled': { at: new Date().toISOString().slice(0, 10), by, reason } } });
  await logActivity(MODEL[c.side as Side], String(c.docId), by, `Refund ${r.ref} cancelled: ${reason}.`);
  return getCredit(id);
}

/** Cancels a whole payment (a mistake, a bounced cheque): kept on the document, marked cancelled, reversed in the books. */
export async function cancelPayment(side: Side, docId: string, payId: string, reason: string, by: string) {
  const d = await db();
  const doc = ObjectId.isValid(docId) ? await d.collection(COL[side]).findOne({ _id: new ObjectId(docId) }) : null;
  const p = (doc?.payments as Payment[] | undefined)?.find((x) => x.id === payId);
  if (!doc || !p) throw new HttpError(404, 'Payment not found.');
  if (p.method === 'credit') throw new HttpError(409, 'That’s a credit note applied here, not a payment.');
  if (p.cancelled) throw new HttpError(409, 'This payment is already cancelled.');
  await d.collection(COL[side]).updateOne({ _id: doc._id, 'payments.id': payId }, { $set: { 'payments.$.cancelled': { at: new Date().toISOString().slice(0, 10), by, reason } } });
  await settle(side, doc._id);
  await logActivity(MODEL[side], docId, by, `${side === 'customer' ? 'Receipt' : 'Payment voucher'} ${p.ref} for ${money(p.amount, String(doc.currency || 'USD'))} cancelled: ${reason}.`);
}
