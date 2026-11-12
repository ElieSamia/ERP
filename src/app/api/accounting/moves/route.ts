import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { moveSchema } from '@/lib/schemas';
import { getMove } from '@/lib/accounting';
import { logActivity } from '@/lib/activity';

/** Manual journal entries (opening balances, salaries, adjustments). They start as drafts. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser('admin');
    const data = moveSchema.parse(await req.json());
    const r = await (await db()).collection('moves').insertOne({ ...data, ref: null, status: 'draft', auto: false, createdAt: new Date(), createdBy: user.name });
    await logActivity('move', String(r.insertedId), user.name, 'Draft entry created.');
    return getMove(String(r.insertedId));
  });
}
