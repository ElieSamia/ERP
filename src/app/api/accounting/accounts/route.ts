import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { accountSchema } from '@/lib/schemas';
import { getChart } from '@/lib/accounting';

export async function GET() {
  return handle(async () => { await requireUser('admin'); return getChart(); });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const a = accountSchema.parse(await req.json());
    const chart = await getChart();
    if (chart.some((x) => x.code === a.code)) throw new HttpError(409, `Account ${a.code} already exists.`);
    await (await db()).collection<{ _id: string }>('accounts').insertOne({ _id: a.code, ...a });
    return getChart();
  });
}
