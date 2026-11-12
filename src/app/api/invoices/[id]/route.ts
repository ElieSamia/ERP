import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { invoiceEditSchema } from '@/lib/schemas';
import { getInvoice } from '@/lib/finance';
import { logActivity } from '@/lib/activity';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const i = await getInvoice((await params).id);
    if (!i) throw new HttpError(404, 'Invoice not found.');
    return i;
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const col = (await db()).collection('invoices');
    const before = await col.findOne({ _id: oid(id) });
    if (!before) throw new HttpError(404, 'Invoice not found.');
    if (before.status !== 'draft') throw new HttpError(409, 'Posted invoices can’t be changed. Reset it to draft first, if it has no payments.');
    const data = invoiceEditSchema.parse(await req.json());
    if (data.dueDate < data.date) throw new HttpError(400, 'The due date is before the invoice date.');
    await col.updateOne({ _id: oid(id) }, { $set: { ...data, updatedAt: new Date(), updatedBy: user.name } });
    await logActivity('invoice', id, user.name, 'Draft updated.');
    return getInvoice(id);
  });
}

/** Deleting a draft invoice puts the booking back to the status it had before invoicing. */
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const d = await db();
    const inv = await d.collection('invoices').findOne({ _id: oid(id) });
    if (!inv) throw new HttpError(404, 'Invoice not found.');
    if (inv.status !== 'draft') throw new HttpError(409, 'Only draft invoices can be deleted.');
    if (inv.bookingId) {
      const b = await d.collection('bookings').findOne({ _id: oid(inv.bookingId) });
      if (b) {
        await d.collection('bookings').updateOne({ _id: b._id }, { $set: { status: b.prevStatus || 'confirmed' }, $unset: { invoiceId: '', prevStatus: '' } });
        await logActivity('booking', String(b._id), user.name, 'Draft invoice deleted. Booking returned to its previous status.');
      }
    }
    await d.collection('invoices').deleteOne({ _id: oid(id) });
    await d.collection('activity').deleteMany({ model: 'invoice', recordId: id });
    return { ok: true };
  });
}
