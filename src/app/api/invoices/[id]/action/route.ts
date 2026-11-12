import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { docTotals, getInvoice, invoiceNumber } from '@/lib/finance';
import { logActivity } from '@/lib/activity';

const schema = z.object({ action: z.enum(['post', 'draft']) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const { action } = schema.parse(await req.json());
    const col = (await db()).collection('invoices');
    const inv = await col.findOne({ _id: oid(id) });
    if (!inv) throw new HttpError(404, 'Invoice not found.');
    if (action === 'post') {
      if (inv.status !== 'draft') throw new HttpError(409, 'This invoice is already posted.');
      if (!(inv.lines || []).length || docTotals(inv.lines).total <= 0) throw new HttpError(400, 'Add at least one line with an amount before posting.');
      const number = inv.number || (await invoiceNumber(inv.date));
      await col.updateOne({ _id: oid(id) }, { $set: { number, status: 'posted', postedAt: new Date(), postedBy: user.name } });
      await logActivity('invoice', id, user.name, `Posted as ${number}.`);
    } else {
      if (inv.status !== 'posted') throw new HttpError(409, 'Only posted invoices can go back to draft.');
      if ((inv.payments || []).length) throw new HttpError(409, 'This invoice has payments, so it can’t go back to draft.');
      await col.updateOne({ _id: oid(id) }, { $set: { status: 'draft' } });
      await logActivity('invoice', id, user.name, 'Reset to draft. It keeps its number.');
    }
    return getInvoice(id);
  });
}
