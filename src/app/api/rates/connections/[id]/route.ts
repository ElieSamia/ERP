import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { listConnections, sealCredentials } from '@/lib/rates';
import { decrypt } from '@/lib/mail';
import { connectionSchema } from '@/lib/schemas';

type Ctx = { params: Promise<{ id: string }> };
/** Updates a connection. Empty credential fields keep the saved values, which are never sent back. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser('admin');
    const id = (await params).id;
    const col = (await db()).collection('connections');
    const cur = await col.findOne({ _id: oid(id) });
    if (!cur) throw new HttpError(404, 'Connection not found.');
    const d = connectionSchema.omit({ provider: true }).parse(await req.json());
    const old = cur.credentialsEnc ? (JSON.parse(decrypt(String(cur.credentialsEnc))) as Record<string, string>) : {};
    const creds = { ...old, ...Object.fromEntries(Object.entries(d.credentials).filter(([, v]) => v)) };
    await col.updateOne({ _id: cur._id }, { $set: { name: d.name, kinds: d.kinds, mode: d.mode, supplierId: d.supplierId, active: d.active, credentialsEnc: sealCredentials(creds), updatedAt: new Date() } });
    return listConnections();
  });
}
/** Removing a connection keeps bookings intact; their reserved services simply can't be changed through it any more. */
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser('admin');
    await (await db()).collection('connections').deleteOne({ _id: oid((await params).id) });
    return listConnections();
  });
}
