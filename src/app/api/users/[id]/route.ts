import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { listUsers } from '@/lib/queries';

const schema = z.object({ active: z.boolean().optional(), role: z.enum(['admin', 'staff']).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser('admin');
    const id = (await params).id;
    if (id === me.sub) throw new HttpError(400, 'You can’t change your own access. Ask another administrator.');
    const data = schema.parse(await req.json());
    const r = await (await db()).collection('users').updateOne({ _id: oid(id) }, { $set: data });
    if (!r.matchedCount) throw new HttpError(404, 'User not found.');
    return listUsers();
  });
}
