import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { getExpense } from '@/lib/finance';
import { logActivity } from '@/lib/activity';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const { action } = z.object({ action: z.enum(['post', 'draft']) }).parse(await req.json());
    const col = (await db()).collection('expenses');
    const e = await col.findOne({ _id: oid(id) });
    if (!e) throw new HttpError(404, 'Expense not found.');
    if (action === 'post') {
      if (e.status !== 'draft') throw new HttpError(409, 'This expense is already posted.');
      if (!(Number(e.amount) > 0)) throw new HttpError(400, 'Enter an amount above zero.');
      await col.updateOne({ _id: oid(id) }, { $set: { status: 'posted', postedAt: new Date(), postedBy: user.name } });
      await logActivity('expense', id, user.name, 'Expense posted.');
    } else {
      if (e.status !== 'posted') throw new HttpError(409, 'Only posted expenses can go back to draft.');
      await col.updateOne({ _id: oid(id) }, { $set: { status: 'draft' } });
      await logActivity('expense', id, user.name, 'Reset to draft.');
    }
    return getExpense(id);
  });
}
