import { handle, HttpError } from '@/lib/api';
import { addOrderMessage, requirePortal, supplierOrder } from '@/lib/portal';
import { attach, readForm } from '@/lib/attachments';
import { getPurchase } from '@/lib/finance';
import { DOC_KINDS, SUPPLIER_DOC_KINDS, label } from '@/lib/constants';

/**
 * A supplier attaches a file to an order at any stage except cancelled: a confirmation, a voucher, ticket copies,
 * or the bill file itself (also after you have recorded the bill). Reservations send anything; Accounts send bills.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requirePortal((p) => p.orders === 'respond' || p.bills === 'upload');
    const id = (await params).id;
    const po = await supplierOrder(ctx, id);
    if (!po) throw new HttpError(404, 'Order not found.');
    if (po.status === 'cancelled') throw new HttpError(409, 'This order was cancelled.');
    const form = await readForm(req);
    const kind = String(form.get('kind') || '');
    if (!(SUPPLIER_DOC_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, 'Choose the type of file.');
    if (kind === 'bill' ? ctx.perms.bills !== 'upload' && ctx.perms.orders !== 'respond' : ctx.perms.orders !== 'respond')
      throw new HttpError(403, kind === 'bill' ? 'Your access doesn’t include bills.' : 'Your access only includes bill files.');
    form.set('traveller', '');
    const who = `${ctx.name}, ${ctx.contactName}`;
    const docs = await attach('purchase', id, form, who, { fromPortal: true });
    const doc = docs.at(-1)!;
    await addOrderMessage(id, 'system', '', `${label(DOC_KINDS, kind)} uploaded by ${ctx.name}: ${doc.name}.`);
    return getPurchase(id);
  });
}
