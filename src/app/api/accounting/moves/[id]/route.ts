import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { moveSchema } from '@/lib/schemas';
import { getMove } from '@/lib/accounting';
import { logActivity } from '@/lib/activity';

type Ctx = { params: Promise<{ id: string }> };

async function editable(id: string) {
  const m = await (await db()).collection('moves').findOne({ _id: oid(id) });
  if (!m) throw new HttpError(404, 'Entry not found.');
  if (m.auto) throw new HttpError(409, 'This entry comes from a document. Change the document instead.');
  if (m.status !== 'draft') throw new HttpError(409, 'Posted entries can’t be changed. Reset it to draft first.');
  return m;
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser('admin');
    const id = (await params).id;
    await editable(id);
    const data = moveSchema.parse(await req.json());
    await (await db()).collection('moves').updateOne({ _id: oid(id) }, { $set: { ...data, updatedAt: new Date(), updatedBy: user.name } });
    await logActivity('move', id, user.name, 'Draft updated.');
    return getMove(id);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser('admin');
    const id = (await params).id;
    await editable(id);
    const d = await db();
    await d.collection('moves').deleteOne({ _id: oid(id) });
    await d.collection('activity').deleteMany({ model: 'move', recordId: id });
    return { ok: true };
  });
}
