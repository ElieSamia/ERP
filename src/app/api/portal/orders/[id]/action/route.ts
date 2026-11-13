import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid } from '@/lib/api';
import { addOrderMessage, requirePortal, supplierOrder } from '@/lib/portal';
import { getPurchase } from '@/lib/finance';
import { logActivity } from '@/lib/activity';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ack'), ref: z.string().trim().max(80).default(''), text: z.string().trim().max(4000).default('') }),
  z.object({ action: z.literal('message'), text: z.string().trim().min(1, 'Write a message first.').max(4000) }),
]);

/** The supplier confirms an order (with their own reference) or writes to your team. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requirePortal((p) => p.orders === 'respond');
    const id = (await params).id;
    const po = await supplierOrder(ctx, id);
    if (!po) throw new HttpError(404, 'Order not found.');
    const body = schema.parse(await req.json());
    const who = `${ctx.name}, ${ctx.contactName}`;
    if (po.status === 'cancelled') throw new HttpError(409, 'This order was cancelled.');
    if (body.action === 'ack') {
      if (po.supplierAck) throw new HttpError(409, 'This order is already confirmed.');
      await (await db()).collection('purchases').updateOne({ _id: oid(id) }, { $set: { supplierAck: { ref: body.ref, at: new Date(), by: who } } });
      await addOrderMessage(id, 'system', '', `Confirmed by ${ctx.name}${body.ref ? `, their reference ${body.ref}` : ''}.`);
      if (body.text) await addOrderMessage(id, 'customer', who, body.text);
      await logActivity('purchase', id, who, `Order confirmed in the supplier portal${body.ref ? ` (reference ${body.ref})` : ''}.`);
    } else {
      await addOrderMessage(id, 'customer', who, body.text);
      await logActivity('purchase', id, who, 'Message from the supplier.');
    }
    return getPurchase(id);
  });
}
