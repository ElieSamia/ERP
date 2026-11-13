import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { bookingSchema } from '@/lib/schemas';
import { checkReferences, getBooking, listBookings, nextBookingRef } from '@/lib/bookings';
import { logActivity } from '@/lib/activity';

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    const p = new URL(req.url).searchParams;
    return listBookings({ q: p.get('q')?.trim() || undefined, status: p.get('status') || undefined });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const data = bookingSchema.parse(await req.json());
    await checkReferences(data.contactId, data.lines.map((l) => l.supplierId));
    const ref = await nextBookingRef();
    const r = await (await db()).collection('bookings').insertOne({
      ...data, ref, status: 'draft', docs: [], createdAt: new Date(), createdBy: user.name,
    });
    await logActivity('booking', String(r.insertedId), user.name, `Booking ${ref} created.`);
    return getBooking(String(r.insertedId));
  });
}
