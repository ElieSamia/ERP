import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { docTotals, getPurchase } from '@/lib/finance';
import { logActivity } from '@/lib/activity';
import { todayISO } from '@/lib/constants';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('bill'), billRef: z.string().trim().max(80).default(''), billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('draft') }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const body = schema.parse(await req.json());
    const d = await db();
    const p = await d.collection('purchases').findOne({ _id: oid(id) });
    if (!p) throw new HttpError(404, 'Purchase order not found.');
    const set: Record<string, unknown> = {};
    let msg = '';
    if (body.action === 'confirm') {
      if (p.status !== 'draft') throw new HttpError(409, 'Only requests for quotation can be confirmed.');
      if (!(p.lines || []).length) throw new HttpError(400, 'Add at least one line.');
      set.status = 'confirmed'; msg = 'Purchase order confirmed.';
    } else if (body.action === 'bill') {
      if (p.status !== 'confirmed') throw new HttpError(409, 'Confirm the order before recording the supplier’s bill.');
      if (docTotals(p.lines || []).total <= 0) throw new HttpError(400, 'The order has no amount to bill.');
      set.status = 'billed'; set.billRef = body.billRef || p.billRef || ''; set.billDate = body.billDate || p.billDate || todayISO();
      msg = `Supplier bill recorded${set.billRef ? `, ${set.billRef}` : ''}.`;
    } else if (body.action === 'cancel') {
      if (!['draft', 'confirmed'].includes(p.status)) throw new HttpError(409, 'Billed or paid orders can’t be cancelled.');
      set.status = 'cancelled'; msg = 'Cancelled.';
      if (p.bookingId) await d.collection('bookings').updateOne({ _id: oid(p.bookingId) }, { $unset: { 'lines.$[l].poId': '' } }, { arrayFilters: [{ 'l.poId': id }] });
    } else {
      if (p.status !== 'cancelled') throw new HttpError(409, 'Only cancelled orders can go back to a request for quotation.');
      set.status = 'draft'; msg = 'Reset to request for quotation.';
    }
    await d.collection('purchases').updateOne({ _id: oid(id) }, { $set: { ...set, updatedAt: new Date(), updatedBy: user.name } });
    await logActivity('purchase', id, user.name, msg);
    return getPurchase(id);
  });
}
