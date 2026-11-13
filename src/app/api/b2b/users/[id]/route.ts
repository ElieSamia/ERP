import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { getRoles, listPortalUsers } from '@/lib/portal';
import { logActivity } from '@/lib/activity';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const data = z.object({ roleId: z.string().optional(), active: z.boolean().optional() }).parse(await req.json());
    if (data.roleId && !(await getRoles()).some((r) => r.id === data.roleId)) throw new HttpError(400, 'Choose a role.');
    const col = (await db()).collection('portalUsers');
    const u = await col.findOne({ _id: oid(id) });
    if (!u) throw new HttpError(404, 'User not found.');
    await col.updateOne({ _id: u._id }, { $set: data });
    await logActivity('contact', String(u.contactId), user.name, data.active === false ? `Portal user ${u.name} deactivated.` : data.active ? `Portal user ${u.name} activated.` : `Portal user ${u.name}'s role changed.`);
    return listPortalUsers(String(u.contactId));
  });
}
