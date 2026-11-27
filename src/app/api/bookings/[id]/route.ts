import { accessFor } from '@/lib/roles';
import { keepCosts, maskBooking, priceFromCatalogue } from '@/lib/costmask';
import type { BookingLine } from '@/lib/types';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { bookingSchema } from '@/lib/schemas';
import { checkReferences, getBooking } from '@/lib/bookings';
import { logActivity } from '@/lib/activity';
import { removeAllFiles } from '@/lib/attachments';
import { label, TRIP_TYPES } from '@/lib/constants';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const me = await requireUser();
    const b = await getBooking((await params).id);
    if (!b) throw new HttpError(404, 'Booking not found.');
    return (await accessFor(me.sub, me.role)).costs ? b : maskBooking(b);
  });
}

/** Saves the whole form. Services can only change while the booking is a draft or confirmed. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const col = (await db()).collection('bookings');
    const before = await col.findOne({ _id: oid(id) });
    if (!before) throw new HttpError(404, 'Booking not found.');
    const data = bookingSchema.parse(await req.json());
    const costs = (await accessFor(user.sub, user.role)).costs;
    if (!costs) {
      // Without access to costs: prices and internal notes stay as they were.
      data.lines = await priceFromCatalogue(keepCosts(data.lines as BookingLine[], (before.lines as BookingLine[]) || []), (before.lines as BookingLine[]) || [], data.contactId) as typeof data.lines;
      data.notes = String(before.notes ?? '');
    }
    // Provider links are the server's own record: never taken from the form, kept as they were.
    type Api = { status?: string; provider?: string };
    const prevLines = (before.lines as { id: string; cost: number; api?: Api }[]) || [];
    for (const l of data.lines as { id: string; cost: number; api?: Api }[]) {
      const p = prevLines.find((x) => x.id === l.id);
      if (p?.api) {
        l.api = p.api;
        if (['held', 'confirmed'].includes(p.api.status ?? '') && Math.abs(Number(l.cost) - Number(p.cost)) > 0.009)
          throw new HttpError(409, `The cost of a service reserved with ${p.api.provider} comes from the provider and can’t be changed here.`);
      } else delete l.api;
    }
    const removed = prevLines.find((p) => ['held', 'confirmed'].includes(p.api?.status ?? '') && !data.lines.some((l) => l.id === p.id));
    if (removed) throw new HttpError(409, `A service is reserved with ${removed.api!.provider}. Cancel the reservation before removing it.`);
    // Compare services field by field, so older records saved before a field existed don't count as changed.
    type L = { id: string; type: string; desc: string; date: string; dateTo: string; supplierId: string; cost: number; markup: number; markupType?: string; poId?: string };
    const canon = (ls: L[]) => JSON.stringify(ls.map((l) => [l.id, l.type, l.desc || '', l.date || '', l.dateTo || '', l.supplierId || '', Number(l.cost) || 0, Number(l.markup) || 0, l.markupType || 'percent', l.poId || '']));
    const linesChanged = canon(data.lines) !== canon((before.lines as L[]) || []);
    const headerKeys = ['contactId', 'tripType', 'bookingDate', 'origin', 'destination', 'destinationName', 'departDate', 'returnDate', 'travellers'] as const;
    const headerChanged = headerKeys.some((k) => (data[k] ?? '') !== (before[k] ?? ''));
    if (linesChanged && !['draft', 'confirmed'].includes(before.status)) throw new HttpError(409, 'Services can’t be changed once the booking is ticketed or cancelled.');
    if (headerChanged && before.status === 'cancelled') throw new HttpError(409, 'Reset the booking to draft before changing its details.');
    if (data.contactId !== before.contactId && before.status !== 'draft') throw new HttpError(409, 'The customer can only be changed while the booking is a draft.');
    await checkReferences(data.contactId, data.lines.map((l) => l.supplierId));
    await col.updateOne({ _id: oid(id) }, { $set: { ...data, updatedAt: new Date(), updatedBy: user.name } });
    const notes: string[] = [];
    if (data.tripType !== before.tripType) notes.push(`Trip type changed to ${label(TRIP_TYPES, data.tripType)}.`);
    if (linesChanged) notes.push('Services updated.');
    if (headerChanged && !notes.length) notes.push('Trip details updated.');
    if (!notes.length) notes.push('Notes updated.');
    await logActivity('booking', id, user.name, notes.join(' '));
    const saved = await getBooking(id);
    return saved && !costs ? maskBooking(saved) : saved;
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const id = (await params).id;
    const d = await db();
    const b = await d.collection('bookings').findOne({ _id: oid(id) });
    if (!b) throw new HttpError(404, 'Booking not found.');
    if (b.status !== 'draft') throw new HttpError(409, 'Only draft bookings can be deleted. Cancel it instead.');
    await removeAllFiles(b.docs);
    await d.collection('bookings').deleteOne({ _id: oid(id) });
    await d.collection('leads').updateMany({ bookingId: id }, { $unset: { bookingId: '' } });
    await d.collection('activity').deleteMany({ model: 'booking', recordId: id });
    return { ok: true };
  });
}
