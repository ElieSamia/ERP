import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { exposure, getBooking } from '@/lib/bookings';
import { logActivity } from '@/lib/activity';
import { money, totals } from '@/lib/constants';

const schema = z.object({ action: z.enum(['confirm', 'ticket', 'cancel', 'draft']) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const { action } = schema.parse(await req.json());
    const d = await db();
    const b = await d.collection('bookings').findOne({ _id: oid(id) });
    if (!b) throw new HttpError(404, 'Booking not found.');
    const lines = (b.lines || []) as { date: string; cost: number; markup: number }[];
    let next = b.status as string;
    let msg = '';
    if (action === 'confirm') {
      if (b.status !== 'draft') throw new HttpError(409, 'Only draft bookings can be confirmed.');
      if (!lines.length) throw new HttpError(400, 'Add at least one service before confirming.');
      if (b.tripType !== 'service' && !b.departDate) throw new HttpError(400, 'Set a departure date before confirming.');
      if (b.tripType === 'return' && !b.returnDate) throw new HttpError(400, 'Set a return date, or change the trip type to one way.');
      if (b.tripType === 'service' && lines.some((l) => !l.date)) throw new HttpError(400, 'Set a date on every service before confirming.');
      const c = await d.collection('contacts').findOne({ _id: oid(b.contactId) });
      const limit = Number(c?.creditLimit) || 0;
      if (c && (c.type === 'agency' || c.type === 'corporate') && limit > 0) {
        const used = await exposure(b.contactId, id);
        const total = totals(lines).total;
        if (used + total > limit) throw new HttpError(409, `Credit limit reached: ${c.name} has ${money(Math.max(0, limit - used))} available and this booking is ${money(total)}.`);
      }
      next = 'confirmed'; msg = 'Booking confirmed.';
    } else if (action === 'ticket') {
      if (b.status !== 'confirmed') throw new HttpError(409, 'Confirm the booking before marking it as ticketed.');
      next = 'ticketed'; msg = 'Marked as ticketed.';
    } else if (action === 'cancel') {
      if (!['draft', 'confirmed', 'ticketed'].includes(b.status)) throw new HttpError(409, 'This booking can’t be cancelled.');
      next = 'cancelled'; msg = 'Booking cancelled.';
    } else {
      if (b.status !== 'cancelled') throw new HttpError(409, 'Only cancelled bookings can go back to draft.');
      next = 'draft'; msg = 'Reset to draft.';
    }
    await d.collection('bookings').updateOne({ _id: oid(id) }, { $set: { status: next, updatedAt: new Date(), updatedBy: user.name } });
    await logActivity('booking', id, user.name, msg);
    return getBooking(id);
  });
}
