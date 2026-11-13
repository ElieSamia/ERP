import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { getRoles, roleSchema } from '@/lib/portal';

type Ctx = { params: Promise<{ id: string }> };

/** Built-in roles are fixed; only custom roles can be changed or deleted. Changes apply to their users at once. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser('admin');
    const id = (await params).id;
    const data = roleSchema.parse(await req.json());
    const r = await (await db()).collection('portalRoles').updateOne({ _id: oid(id) }, { $set: data });
    if (!r.matchedCount) throw new HttpError(404, 'Built-in roles can’t be changed. Duplicate one to make your own.');
    return getRoles();
  });
}
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser('admin');
    const id = (await params).id;
    const d = await db();
    const n = await d.collection('portalUsers').countDocuments({ roleId: id });
    if (n) throw new HttpError(409, `${n} user${n > 1 ? 's use' : ' uses'} this role. Give them another role first.`);
    const r = await d.collection('portalRoles').deleteOne({ _id: oid(id) });
    if (!r.deletedCount) throw new HttpError(404, 'Built-in roles can’t be deleted.');
    return getRoles();
  });
}
