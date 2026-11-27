import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { forgetAccess, listRoles, roleSchema, roleSummary as summary } from '@/lib/roles';
import { audit } from '@/lib/audit';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser('admin');
    const id = (await params).id;
    const r = roleSchema.parse(await req.json());
    const before = (await listRoles()).find((x) => x.id === id);
    if (!before) throw new HttpError(404, 'Role not found.');
    await (await db()).collection<{ _id: string }>('roles').updateOne({ _id: id }, { $set: r });
    forgetAccess();
    await audit({ kind: 'users', action: 'Role changed', who: me.name, whoId: me.sub, target: r.name, detail: `Before: ${summary(before)}. After: ${summary(r)}` });
    return listRoles();
  });
}
/** A role can be deleted when nobody has it; "Staff (full access)" stays, as the fallback. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser('admin');
    const id = (await params).id;
    if (id === 'staff-full') throw new HttpError(409, 'This role is the fallback for staff without a role, so it can’t be deleted. You can change it.');
    const role = (await listRoles()).find((x) => x.id === id);
    if (!role) throw new HttpError(404, 'Role not found.');
    const n = await (await db()).collection('users').countDocuments({ role: 'staff', roleId: id });
    if (n) throw new HttpError(409, `${n} user${n === 1 ? ' has' : 's have'} this role. Give them another role first.`);
    await (await db()).collection<{ _id: string }>('roles').deleteOne({ _id: id });
    await audit({ kind: 'users', action: 'Role deleted', who: me.name, whoId: me.sub, target: role.name });
    return listRoles();
  });
}
