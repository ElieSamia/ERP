import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { checkReferences, getBooking, nextBookingRef } from '@/lib/bookings';
import { logActivity } from '@/lib/activity';
import { fmtDate, money } from '@/lib/constants';

/** Turns an opportunity into a draft booking, carrying its details into the internal notes. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const d = await db();
    const l = await d.collection('leads').findOne({ _id: oid(id) });
    if (!l) throw new HttpError(404, 'Opportunity not found.');
    if (l.bookingId) {
      const existing = await getBooking(String(l.bookingId));
      if (existing) return existing;
    }
    if (l.stage === 'lost') throw new HttpError(409, 'This opportunity is lost. Move it back to an open stage first.');
    await checkReferences(String(l.contactId), []);
    const ref = await nextBookingRef();
    const notes = [
      `From opportunity: ${l.title}`, `Travellers: ${l.pax || 'not set'}`, `Budget: ${money(Number(l.budget) || 0)}`,
      `Preferred travel date: ${fmtDate(l.travelDate)}`, l.notes ? `\nOpportunity notes:\n${l.notes}` : '',
    ].filter(Boolean).join('\n');
    const r = await d.collection('bookings').insertOne({
      ref, contactId: String(l.contactId), tripType: 'return', bookingDate: new Date().toISOString().slice(0, 10),
      origin: 'BEY', destination: '', destinationName: l.destination || '', departDate: l.travelDate || '', returnDate: '',
      travellers: '', tripNotes: '', notes, lines: [], docs: [], status: 'draft', leadId: id, createdAt: new Date(), createdBy: user.name,
    });
    const bid = String(r.insertedId);
    await d.collection('leads').updateOne({ _id: oid(id) }, { $set: { stage: 'won', bookingId: bid, updatedAt: new Date(), updatedBy: user.name } });
    await logActivity('lead', id, user.name, `Won. Converted to booking ${ref}.`);
    await logActivity('booking', bid, user.name, `Booking ${ref} created from opportunity “${l.title}”.`);
    return getBooking(bid);
  });
}
