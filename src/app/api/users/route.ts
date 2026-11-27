import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { listRoles } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { newUserSchema } from '@/lib/schemas';
import { listUsers } from '@/lib/queries';

export async function GET() {
  return handle(async () => {
    await requireUser('admin');
    return listUsers();
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser('admin');
    const u = newUserSchema.parse(await req.json());
    const roles = await listRoles();
    if (u.role === 'staff' && !roles.some((r) => r.id === u.roleId)) throw new HttpError(400, 'Choose one of the roles.');
    if (await (await db()).collection('users').findOne({ email: u.email })) throw new HttpError(409, 'A user with that email already exists.');
    await (await db()).collection('users').insertOne({
      name: u.name, email: u.email, role: u.role, roleId: u.role === 'staff' ? u.roleId : undefined, active: true, passwordHash: await hash(u.password, 12), createdAt: new Date(),
    });
    await audit({ kind: 'users', action: 'User created', who: me.name, whoId: me.sub, target: `${u.name} <${u.email}>`, detail: u.role === 'admin' ? 'Administrator' : `Role: ${roles.find((r) => r.id === u.roleId)?.name}` });
    return listUsers();
  });
}
