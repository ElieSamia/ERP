import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { accSettingsSchema } from '@/lib/schemas';
import { getAccSettings, getChart } from '@/lib/accounting';

export async function GET() {
  return handle(async () => { await requireUser('admin'); return getAccSettings(); });
}

/** Account mapping only affects entries created from now on, or documents that change. Posted history stays as it was. */
export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const data = accSettingsSchema.parse(await req.json());
    const codes = new Set((await getChart()).map((a) => a.code));
    const used = [...Object.values(data.rev), ...Object.values(data.cost), ...Object.values(data.expense), ...Object.values(data.payment), data.receivable, data.payable, data.vatOut, data.vatIn, data.openingOffset];
    const missing = used.find((c) => !codes.has(c));
    if (missing) throw new HttpError(400, `Account ${missing} isn’t in the chart of accounts.`);
    if (!data.currencies.some((c) => c.code === 'USD' && c.rate === 1)) throw new HttpError(400, 'Keep USD in the list with a rate of 1, since the books are kept in USD.');
    await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'accounting' }, { $set: data }, { upsert: true });
    return getAccSettings();
  });
}
