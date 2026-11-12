import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { getChart } from '@/lib/accounting';

/** Renames an account or changes its type. Codes never change, since entries refer to them. */
export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    await requireUser('admin');
    const code = (await params).code;
    const data = z.object({ name: z.string().trim().min(1, 'Name the account.').max(100) }).parse(await req.json());
    const r = await (await db()).collection<{ _id: string }>('accounts').updateOne({ _id: code }, { $set: data });
    if (!r.matchedCount) throw new HttpError(404, 'Account not found.');
    return getChart();
  });
}
