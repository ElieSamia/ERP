import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { bookingSchema } from '@/lib/schemas';
import { checkReferences, getBooking, listBookings, nextBookingRef } from '@/lib/bookings';
import { logActivity } from '@/lib/activity';

export async function GET(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const p = new URL(req.url).searchParams;
    const list = await listBookings({ q: p.get('q')?.trim() || undefined, status: p.get('status') || undefined });
    if ((await (await import('@/lib/roles')).accessFor(me.sub, me.role)).costs) return list;
    const { maskBooking } = await import('@/lib/costmask');
    return list.map((b) => maskBooking(b));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const data = bookingSchema.parse(await req.json());
    // Without access to costs, new services arrive unpriced, for someone with access to price them.
    const meAccess = await (await import('@/lib/roles')).accessFor((await (await import('@/lib/auth')).getSession())!.sub, (await (await import('@/lib/auth')).getSession())!.role);
    if (!meAccess.costs) data.lines = await (await import('@/lib/costmask')).priceFromCatalogue(data.lines.map((l) => ({ ...l, cost: 0, markup: 0, markupType: 'percent' as const, fixedMarkup: false })), [], data.contactId) as typeof data.lines;
    for (const l of data.lines as { api?: unknown }[]) delete l.api; // provider links are only created by the Rates desk
    await checkReferences(data.contactId, data.lines.map((l) => l.supplierId));
    const ref = await nextBookingRef();
    const r = await (await db()).collection('bookings').insertOne({
      ...data, ref, status: 'draft', docs: [], createdAt: new Date(), createdBy: user.name,
    });
    await logActivity('booking', String(r.insertedId), user.name, `Booking ${ref} created.`);
    return getBooking(String(r.insertedId));
  });
}
