import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { purchaseSchema } from '@/lib/schemas';
import { getPurchase } from '@/lib/finance';
import { logActivity } from '@/lib/activity';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const p = await getPurchase((await params).id);
    if (!p) throw new HttpError(404, 'Purchase order not found.');
    return p;
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const d = await db();
    const before = await d.collection('purchases').findOne({ _id: oid(id) });
    if (!before) throw new HttpError(404, 'Purchase order not found.');
    if (!['draft', 'confirmed'].includes(before.status)) throw new HttpError(409, 'Billed, paid or cancelled orders can’t be changed.');
    const data = purchaseSchema.parse(await req.json());
    if (data.supplierId !== before.supplierId) {
      const s = await d.collection('contacts').findOne({ _id: oid(data.supplierId) });
      if (!s || s.type !== 'supplier') throw new HttpError(400, 'Choose a supplier.');
    }
    await d.collection('purchases').updateOne({ _id: oid(id) }, { $set: { ...data, updatedAt: new Date(), updatedBy: user.name } });
    await logActivity('purchase', id, user.name, 'Order updated.');
    return getPurchase(id);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const id = (await params).id;
    const d = await db();
    const p = await d.collection('purchases').findOne({ _id: oid(id) });
    if (!p) throw new HttpError(404, 'Purchase order not found.');
    if (p.status !== 'draft') throw new HttpError(409, 'Only requests for quotation can be deleted. Cancel the order instead.');
    if (p.bookingId) await d.collection('bookings').updateOne({ _id: oid(p.bookingId) }, { $unset: { 'lines.$[l].poId': '' } }, { arrayFilters: [{ 'l.poId': id }] });
    await d.collection('purchases').deleteOne({ _id: oid(id) });
    await d.collection('activity').deleteMany({ model: 'purchase', recordId: id });
    return { ok: true };
  });
}
