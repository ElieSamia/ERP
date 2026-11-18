import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { EMPTY_FILTER } from '@/lib/marketing';
import { audienceSchema } from '@/lib/schemas';

type Ctx = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const body = await req.json();
    const data = audienceSchema.parse({ ...body, filter: { ...EMPTY_FILTER, ...(body.filter || {}) } });
    const r = await (await db()).collection('audiences').updateOne({ _id: oid((await params).id) }, { $set: { ...data, updatedAt: new Date() } });
    if (!r.matchedCount) throw new HttpError(404, 'Audience not found.');
    return { ok: true };
  });
}
/** Audiences used by a campaign can't be deleted, so past campaigns stay readable. */
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const id = (await params).id;
    const d = await db();
    const n = await d.collection('campaigns').countDocuments({ audienceId: id });
    if (n) throw new HttpError(409, `This audience is used by ${n} campaign${n === 1 ? '' : 's'}, so it can’t be deleted.`);
    await d.collection('audiences').deleteOne({ _id: oid(id) });
    return { ok: true };
  });
}
