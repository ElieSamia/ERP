import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { offerLines } from '@/lib/rates';
import { channelRate, nextBookingRef } from '@/lib/bookings';
import { logActivity } from '@/lib/activity';
import { addMessage, syncLead } from '@/lib/portal';
import { notifyRequest } from '@/lib/notify';
import { money, r2, sell, todayISO } from '@/lib/constants';

const schema = z.object({
  tokens: z.array(z.string().max(40)).min(1, 'Select at least one result.').max(20),
  target: z.discriminatedUnion('type', [
    z.object({ type: z.literal('new'), contactId: z.string().min(1, 'Choose the customer.') }),
    z.object({ type: z.literal('booking'), bookingId: z.string().min(1) }),
    z.object({ type: z.literal('request'), requestId: z.string().min(1), validDays: z.coerce.number().int().min(1).max(60).default(7) }),
  ]),
});

/**
 * Puts selected results where they're needed: a new draft booking for a customer, an existing draft booking,
 * or a quote on a portal request (which becomes these exact services if the customer accepts).
 * Markup is the customer's channel default, still editable per sale on the booking.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { tokens, target } = schema.parse(await req.json());
    const d = await db();
    const contactId = target.type === 'new' ? target.contactId
      : target.type === 'booking' ? String((await d.collection('bookings').findOne({ _id: oid(target.bookingId) }))?.contactId ?? '')
      : String((await d.collection('requests').findOne({ _id: oid(target.requestId) }))?.contactId ?? '');
    const c = contactId ? await d.collection('contacts').findOne({ _id: oid(contactId) }) : null;
    if (!c) throw new HttpError(404, target.type === 'new' ? 'Customer not found.' : 'Not found.');
    if (c.type === 'supplier') throw new HttpError(400, 'Choose a customer, agency or corporate account.');
    const { markup, markupType } = await channelRate(String(c.type));
    const lines = await offerLines(tokens, markup, markupType);
    const first = lines.map((l) => l.date).filter(Boolean).sort()[0] ?? '';
    const last = lines.map((l) => l.dateTo || l.date).filter(Boolean).sort().at(-1) ?? '';
    const onlyServices = lines.every((l) => ['insurance', 'transfer'].includes(l.type));
    if (target.type === 'new') {
      const ref = await nextBookingRef();
      const r = await d.collection('bookings').insertOne({
        ref, contactId, tripType: onlyServices ? 'service' : last && last !== first ? 'return' : 'oneway', bookingDate: todayISO(), origin: '', destination: '', destinationName: '',
        departDate: onlyServices ? '' : first, returnDate: onlyServices || last === first ? '' : last, travellers: '', tripNotes: '', notes: 'Created from the Rates desk.', lines, docs: [], status: 'draft', createdAt: new Date(), createdBy: user.name,
      });
      await logActivity('booking', String(r.insertedId), user.name, `Booking ${ref} created from the Rates desk with ${lines.length} service${lines.length === 1 ? '' : 's'}.`);
      return { bookingId: String(r.insertedId) };
    }
    if (target.type === 'booking') {
      const b = await d.collection('bookings').findOne({ _id: oid(target.bookingId) });
      if (!b || b.status !== 'draft') throw new HttpError(409, 'Services can only be added to a draft booking.');
      await d.collection('bookings').updateOne({ _id: b._id }, { $push: { lines: { $each: lines } } } as never);
      await logActivity('booking', String(b._id), user.name, `${lines.length} service${lines.length === 1 ? '' : 's'} added from the Rates desk.`);
      return { bookingId: String(b._id) };
    }
    const r = await d.collection('requests').findOne({ _id: oid(target.requestId) });
    if (!r || !['submitted', 'review', 'quoted'].includes(String(r.status))) throw new HttpError(409, 'Only an open request can be quoted.');
    const amount = r2(lines.reduce((s, l) => s + sell(l), 0));
    const validUntil = new Date(Date.now() + target.validDays * 86400000).toISOString().slice(0, 10);
    const notes = lines.map((l) => `• ${l.desc.split('\n').join(', ')}`).join('\n');
    await d.collection('requests').updateOne({ _id: r._id }, { $set: { status: 'quoted', quote: { amount, validUntil, notes, at: new Date(), by: user.name }, quoteLines: lines } });
    await addMessage(target.requestId, 'system', '', `Quote sent: ${money(amount)}, valid until ${validUntil}.`);
    await logActivity('request', target.requestId, user.name, `Quote of ${money(amount)} sent from the Rates desk (${lines.length} service${lines.length === 1 ? '' : 's'}).`);
    await syncLead(target.requestId, user.name);
    notifyRequest(target.requestId, 'quote');
    return { requestId: target.requestId, amount };
  });
}
