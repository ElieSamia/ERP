import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { expenseSchema } from '@/lib/schemas';
import { checkExpense, getExpense, listExpenses, nextNumber } from '@/lib/finance';
import { logActivity } from '@/lib/activity';

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    const p = new URL(req.url).searchParams;
    return listExpenses({ q: p.get('q')?.trim() || undefined, status: p.get('status') || undefined });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const data = expenseSchema.parse(await req.json());
    await checkExpense(data);
    const ref = `EX-${String(await nextNumber('expense')).padStart(4, '0')}`;
    const r = await (await db()).collection('expenses').insertOne({ ...data, ref, status: 'draft', createdAt: new Date(), createdBy: user.name });
    await logActivity('expense', String(r.insertedId), user.name, 'Expense created.');
    return getExpense(String(r.insertedId));
  });
}
