import { db } from './db';
import { getFinance } from './finance';
import { addDays, docTotals, money, todayISO } from './constants';

export type CalKind = 'trip' | 'service' | 'due' | 'bill' | 'lead' | 'quote' | 'reminder' | 'deadline';
export type CalEvent = { id: string; date: string; time?: string; kind: CalKind; title: string; sub: string; href?: string; late?: boolean; done?: boolean; note?: string };
export const CAL_KINDS: [CalKind, string][] = [
  ['trip', 'Departures and returns'], ['service', 'Services'], ['due', 'Customer payments due'], ['bill', 'Supplier payments due'],
  ['lead', 'Opportunities'], ['quote', 'Quotes expiring'], ['deadline', 'Provider deadlines'], ['reminder', 'Reminders'],
];

/**
 * Everything dated between two days, from the records themselves: nothing is copied, so the calendar is always
 * in step with bookings, invoices, bills, opportunities, portal quotes and reminders.
 */
export async function calendarEvents(from: string, to: string): Promise<CalEvent[]> {
  const d = await db();
  const today = todayISO();
  const inRange = (x?: string) => !!x && x >= from && x <= to;
  const ev: CalEvent[] = [];

  const bookings = await d.collection('bookings').find({ status: { $ne: 'cancelled' } }, { projection: { ref: 1, contactId: 1, tripType: 1, departDate: 1, returnDate: 1, destinationName: 1, destination: 1, origin: 1, lines: 1, status: 1 } }).toArray();
  const ids = [...new Set(bookings.map((b) => String(b.contactId)))];
  const { ObjectId } = await import('mongodb');
  const cs = ids.length ? await d.collection('contacts').find({ _id: { $in: ids.filter((x) => ObjectId.isValid(x)).map((x) => new ObjectId(x)) } }, { projection: { name: 1 } }).toArray() : [];
  const cname = (id: unknown) => String(cs.find((c) => String(c._id) === String(id))?.name ?? '');
  for (const b of bookings) {
    const href = `/bookings/${b._id}`;
    const where = b.destinationName || b.destination || '';
    const draft = b.status === 'draft' ? ', draft' : '';
    if (b.tripType !== 'service') {
      if (inRange(b.departDate)) ev.push({ id: `dep-${b._id}`, date: b.departDate, kind: 'trip', title: `Departure ${b.ref}${where ? ` to ${where}` : ''}`, sub: `${cname(b.contactId)}${draft}`, href });
      if (b.tripType === 'return' && inRange(b.returnDate)) ev.push({ id: `ret-${b._id}`, date: b.returnDate, kind: 'trip', title: `Return ${b.ref}${where ? ` from ${where}` : ''}`, sub: `${cname(b.contactId)}${draft}`, href });
    }
    // Provider deadlines from the Rates desk: hold or ticketing limits, and the last day to cancel for free.
    for (const l of (b.lines as { id: string; desc: string; api?: { provider: string; status: string; timeLimit?: string; deadline?: string } }[]) || []) {
      const a = l.api;
      if (!a || a.status === 'cancelled') continue;
      const name = (l.desc || '').split('\n')[0].slice(0, 60);
      if (a.timeLimit && a.status !== 'confirmed' && inRange(a.timeLimit)) ev.push({ id: `tl-${b._id}-${l.id}`, date: a.timeLimit, kind: 'deadline', title: `${a.status === 'held' ? 'Ticket by' : 'Reserve by'}: ${name}`, sub: `${b.ref}, ${a.provider}`, href, late: a.timeLimit < today });
      if (a.deadline && inRange(a.deadline)) ev.push({ id: `cd-${b._id}-${l.id}`, date: a.deadline, kind: 'deadline', title: `Last free cancellation: ${name}`, sub: `${b.ref}, ${a.provider}`, href });
    }
    for (const l of (b.lines as { id: string; type: string; desc: string; date: string; dateTo: string }[]) || []) {
      // Flights are already shown as departures and returns; other services show on their own dates.
      if (l.type === 'flight' && b.tripType !== 'service') continue;
      const name = (l.desc || l.type).split('\n')[0].slice(0, 60);
      if (inRange(l.date)) ev.push({ id: `svc-${b._id}-${l.id}`, date: l.date, kind: 'service', title: `${l.type === 'hotel' ? 'Check-in' : 'Service'}: ${name}`, sub: `${b.ref}, ${cname(b.contactId)}`, href });
      if (l.type === 'hotel' && inRange(l.dateTo)) ev.push({ id: `svo-${b._id}-${l.id}`, date: l.dateTo, kind: 'service', title: `Check-out: ${name}`, sub: `${b.ref}, ${cname(b.contactId)}`, href });
    }
  }

  for (const i of await d.collection('invoices').find({ status: 'posted' }).toArray()) {
    if (!inRange(i.dueDate)) continue;
    const bal = docTotals(i.lines || [], i.payments || []).balance;
    if (bal <= 0.004) continue;
    const c = await d.collection('contacts').findOne({ _id: i.contactId instanceof ObjectId ? i.contactId : new ObjectId(String(i.contactId)) }, { projection: { name: 1 } }).catch(() => null);
    ev.push({ id: `inv-${i._id}`, date: i.dueDate, kind: 'due', title: `${i.number}: ${money(bal)} due`, sub: String(c?.name ?? ''), href: `/invoicing/${i._id}`, late: i.dueDate < today });
  }

  const fin = await getFinance();
  for (const p of await d.collection('purchases').find({ status: 'billed' }).toArray()) {
    const due = addDays(String(p.billDate || p.orderDate), fin.supplierTerms);
    if (!inRange(due)) continue;
    const bal = docTotals(p.lines || [], p.payments || []).balance;
    if (bal <= 0.004) continue;
    const c = ObjectId.isValid(String(p.supplierId)) ? await d.collection('contacts').findOne({ _id: new ObjectId(String(p.supplierId)) }, { projection: { name: 1 } }) : null;
    ev.push({ id: `po-${p._id}`, date: due, kind: 'bill', title: `Pay ${c?.name ?? 'supplier'}: ${money(bal)}`, sub: `${p.ref}${p.billRef ? `, bill ${p.billRef}` : ''}`, href: `/purchasing/${p._id}`, late: due < today });
  }

  for (const l of await d.collection('leads').find({ stage: { $nin: ['won', 'lost'] }, travelDate: { $gte: from, $lte: to } }).toArray()) {
    ev.push({ id: `lead-${l._id}`, date: l.travelDate, kind: 'lead', title: `Opportunity: ${l.title}`, sub: `Travel date${l.destination ? `, ${l.destination}` : ''}`, href: `/crm/${l._id}` });
  }

  for (const r of await d.collection('requests').find({ status: 'quoted', 'quote.validUntil': { $gte: from, $lte: to } }).toArray()) {
    ev.push({ id: `rq-${r._id}`, date: r.quote.validUntil, kind: 'quote', title: `Quote expires: ${r.ref}`, sub: `${r.title || ''}, ${money(Number(r.quote.amount) || 0)}`, href: `/b2b/requests/${r._id}`, late: r.quote.validUntil < today });
  }

  for (const m of await d.collection('reminders').find({ date: { $gte: from, $lte: to } }).toArray()) {
    ev.push({ id: String(m._id), date: m.date, time: m.time || undefined, kind: 'reminder', title: m.title, sub: m.by ? `Added by ${m.by}` : '', note: m.note || '', done: !!m.done, href: m.link || undefined, late: !m.done && m.date < today });
  }

  return ev.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title));
}

/** Count for the home tile: what happens in the next 7 days, excluding done reminders. */
export async function weekCount() {
  const t = todayISO();
  return (await calendarEvents(t, addDays(t, 6))).filter((e) => !e.done).length;
}
