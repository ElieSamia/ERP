import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { listRoles, roleSchema, roleSummary as summary } from '@/lib/roles';
import { audit } from '@/lib/audit';

export async function GET() {
  return handle(async () => { await requireUser('admin'); return listRoles(); });
}
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser('admin');
    const r = roleSchema.parse(await req.json());
    await listRoles();
    await (await db()).collection<{ _id: string }>('roles').insertOne({ _id: `r-${randomUUID().slice(0, 8)}`, ...r });
    await audit({ kind: 'users', action: 'Role created', who: me.name, whoId: me.sub, target: r.name, detail: summary(r) });
    return listRoles();
  });
}
