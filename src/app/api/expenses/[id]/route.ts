import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { expenseSchema } from '@/lib/schemas';
import { checkExpense, getExpense } from '@/lib/finance';
import { logActivity } from '@/lib/activity';
import { removeAllFiles } from '@/lib/attachments';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const e = await getExpense((await params).id);
    if (!e) throw new HttpError(404, 'Expense not found.');
    return e;
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const col = (await db()).collection('expenses');
    const before = await col.findOne({ _id: oid(id) });
    if (!before) throw new HttpError(404, 'Expense not found.');
    if (before.status !== 'draft') throw new HttpError(409, 'Posted expenses can’t be changed. Reset it to draft first.');
    const data = expenseSchema.parse(await req.json());
    await checkExpense(data);
    await col.updateOne({ _id: oid(id) }, { $set: { ...data, updatedAt: new Date(), updatedBy: user.name } });
    await logActivity('expense', id, user.name, 'Expense updated.');
    return getExpense(id);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const id = (await params).id;
    const d = await db();
    const e = await d.collection('expenses').findOne({ _id: oid(id) });
    if (!e) throw new HttpError(404, 'Expense not found.');
    if (e.status !== 'draft') throw new HttpError(409, 'Only draft expenses can be deleted.');
    await removeAllFiles(e.docs);
    await d.collection('expenses').deleteOne({ _id: oid(id) });
    await d.collection('activity').deleteMany({ model: 'expense', recordId: id });
    return { ok: true };
  });
}
