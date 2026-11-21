import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { listSources } from '@/lib/enquiries';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser('admin');
    const d = z.object({ name: z.string().trim().min(2).max(80), active: z.boolean(), notify: z.boolean(), autoReply: z.boolean() }).parse(await req.json());
    const r = await (await db()).collection('enqsources').updateOne({ _id: oid((await params).id) }, { $set: d });
    if (!r.matchedCount) throw new HttpError(404, 'Source not found.');
    return listSources();
  });
}
