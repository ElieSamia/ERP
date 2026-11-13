import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid } from '@/lib/api';
import { addOrderMessage, requirePortal, supplierOrder } from '@/lib/portal';
import { attach, readForm } from '@/lib/attachments';
import { getPurchase } from '@/lib/finance';
import { money } from '@/lib/constants';

const fields = z.object({
  billRef: z.string().trim().min(1, 'Enter your bill or invoice number.').max(80),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the bill date.'),
  amount: z.coerce.number().positive('Enter the bill total.'),
});

/** The supplier uploads their bill on an order. It waits on your side until you check it and record it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requirePortal((p) => p.bills === 'upload');
    const id = (await params).id;
    const po = await supplierOrder(ctx, id);
    if (!po) throw new HttpError(404, 'Order not found.');
    if (po.status !== 'confirmed') throw new HttpError(409, po.status === 'cancelled' ? 'This order was cancelled.' : 'This order is already billed. Send us a message if something needs correcting.');
    const form = await readForm(req);
    const f = fields.parse({ billRef: form.get('billRef'), billDate: form.get('billDate'), amount: form.get('amount') });
    const who = `${ctx.name}, ${ctx.contactName}`;
    form.set('kind', 'bill');
    form.set('traveller', '');
    const docs = await attach('purchase', id, form, who, { fromPortal: true });
    const doc = docs.at(-1)!;
    await (await db()).collection('purchases').updateOne({ _id: oid(id) }, { $set: { supplierBill: { ref: f.billRef, date: f.billDate, amount: f.amount, docId: doc.id, at: new Date(), by: who } } });
    await addOrderMessage(id, 'system', '', `Bill ${f.billRef} for ${money(f.amount)} uploaded by ${ctx.name}. Waiting for our accounts team to record it.`);
    return getPurchase(id);
  });
}
