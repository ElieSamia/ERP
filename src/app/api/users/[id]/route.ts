import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { listUsers } from '@/lib/queries';
import { forgetAccess, listRoles } from '@/lib/roles';
import { audit } from '@/lib/audit';

const schema = z.object({ active: z.boolean().optional(), role: z.enum(['admin', 'staff']).optional(), roleId: z.string().max(60).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser('admin');
    const id = (await params).id;
    if (id === me.sub) throw new HttpError(400, 'You can’t change your own access. Ask another administrator.');
    const data = schema.parse(await req.json());
    const col = (await db()).collection('users');
    const before = await col.findOne({ _id: oid(id) });
    if (!before) throw new HttpError(404, 'User not found.');
    const roles = await listRoles();
    if (data.roleId && !roles.some((r) => r.id === data.roleId)) throw new HttpError(400, 'Choose one of the roles.');
    await col.updateOne({ _id: oid(id) }, { $set: data });
    forgetAccess();
    const label = (role: string, rid?: string) => (role === 'admin' ? 'Administrator' : roles.find((r) => r.id === (rid || 'staff-full'))?.name ?? 'Staff');
    const changes = [
      ...(data.active !== undefined && data.active !== before.active ? [data.active ? 'activated' : 'deactivated'] : []),
      ...((data.role || data.roleId) && label(data.role ?? before.role, data.roleId ?? before.roleId) !== label(before.role, before.roleId) ? [`access ${label(before.role, before.roleId)} → ${label(data.role ?? before.role, data.roleId ?? before.roleId)}`] : []),
    ];
    if (changes.length) await audit({ kind: 'users', action: 'User changed', who: me.name, whoId: me.sub, target: `${before.name} <${before.email}>`, detail: changes.join('; ') });
    return listUsers();
  });
}
