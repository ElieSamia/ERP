import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { paymentSchema } from '@/lib/schemas';
import { checkAccount, docTotals, getInvoice, receiptNumber } from '@/lib/finance';
import { logActivity } from '@/lib/activity';
import { money } from '@/lib/constants';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const p = paymentSchema.parse(await req.json());
    const fin = await checkAccount(p.accountId);
    const col = (await db()).collection('invoices');
    const inv = await col.findOne({ _id: oid(id) });
    if (!inv) throw new HttpError(404, 'Invoice not found.');
    if (inv.status !== 'posted') throw new HttpError(409, inv.status === 'paid' ? 'This invoice is already paid.' : 'Post the invoice before registering payments.');
    const { balance } = docTotals(inv.lines || [], inv.payments || []);
    if (p.amount > balance + 0.004) throw new HttpError(400, `The amount is more than the balance due of ${money(balance)}.`);
    const pay = { id: randomUUID(), ref: await receiptNumber(), ...p, by: user.name };
    const paid = docTotals(inv.lines || [], [...(inv.payments || []), pay]).balance <= 0.004;
    await col.updateOne({ _id: oid(id) }, { $push: { payments: pay }, $set: { status: paid ? 'paid' : 'posted' } } as never);
    const acc = fin.accounts.find((a) => a.id === p.accountId)?.name;
    await logActivity('invoice', id, user.name, `Payment of ${money(p.amount)} received into ${acc}, receipt ${pay.ref}.${paid ? ' Invoice fully paid.' : ''}`);
    return { invoice: await getInvoice(id), paymentId: pay.id };
  });
}
