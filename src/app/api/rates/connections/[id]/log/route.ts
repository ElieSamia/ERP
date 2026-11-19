import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';

/** The last 100 calls to this provider: what was asked, how long it took, and what came back or went wrong. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser('admin');
    const list = await (await db()).collection('ratelog').find({ connectionId: (await params).id }).sort({ at: -1 }).limit(100).toArray();
    return list.map((x) => ({ at: (x.at as Date).toISOString(), op: x.op, ms: x.ms, ok: x.ok, summary: x.summary ?? '', error: x.error ?? '' }));
  });
}
