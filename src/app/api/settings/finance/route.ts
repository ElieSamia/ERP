import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { financeSchema } from '@/lib/schemas';
import { getFinance } from '@/lib/finance';

export async function GET() {
  return handle(async () => {
    await requireUser();
    return getFinance();
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const data = financeSchema.parse(await req.json());
    const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id)).size === xs.length;
    if (!ids(data.accounts) || !ids(data.categories)) throw new HttpError(400, 'Two entries have the same code. Give each one its own code.');
    const before = await getFinance();
    const removed = before.accounts.filter((a) => !data.accounts.some((x) => x.id === a.id)).map((a) => a.id);
    if (removed.length) {
      const d = await db();
      const used = (await d.collection('invoices').countDocuments({ 'payments.accountId': { $in: removed } }, { limit: 1 }))
        + (await d.collection('purchases').countDocuments({ 'payments.accountId': { $in: removed } }, { limit: 1 }))
        + (await d.collection('expenses').countDocuments({ paidFrom: { $in: removed } }, { limit: 1 }));
      if (used) throw new HttpError(409, 'An account you removed already has payments. Rename it instead of removing it.');
    }
    await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'finance' }, { $set: data }, { upsert: true });
    return getFinance();
  });
}
