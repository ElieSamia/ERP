import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { paymentSchema } from '@/lib/schemas';
import { checkAccount, docTotals, getPurchase, voucherNumber } from '@/lib/finance';
import { logActivity } from '@/lib/activity';
import { money } from '@/lib/constants';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const p = paymentSchema.parse(await req.json());
    const fin = await checkAccount(p.accountId);
    const col = (await db()).collection('purchases');
    const po = await col.findOne({ _id: oid(id) });
    if (!po) throw new HttpError(404, 'Purchase order not found.');
    if (po.status !== 'billed') throw new HttpError(409, po.status === 'paid' ? 'This order is already paid.' : 'Record the supplier’s bill before paying.');
    const { balance } = docTotals(po.lines || [], po.payments || []);
    if (p.amount > balance + 0.004) throw new HttpError(400, `The amount is more than the ${money(balance)} still owed.`);
    const pay = { id: randomUUID(), ref: await voucherNumber(), ...p, by: user.name };
    const paid = docTotals(po.lines || [], [...(po.payments || []), pay]).balance <= 0.004;
    await col.updateOne({ _id: oid(id) }, { $push: { payments: pay }, $set: { status: paid ? 'paid' : 'billed' } } as never);
    const acc = fin.accounts.find((a) => a.id === p.accountId)?.name;
    await logActivity('purchase', id, user.name, `Paid ${money(p.amount)} from ${acc}, voucher ${pay.ref}.${paid ? ' Fully paid.' : ''}`);
    return { purchase: await getPurchase(id), paymentId: pay.id };
  });
}
