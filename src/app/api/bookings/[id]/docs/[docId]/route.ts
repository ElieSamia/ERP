import { z } from 'zod';
import { del } from '@vercel/blob';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { getBooking } from '@/lib/bookings';
import { logActivity } from '@/lib/activity';

type Ctx = { params: Promise<{ id: string; docId: string }> };

/** Shows or hides a file in the customer portal (used from phase 4). */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id, docId } = await params;
    const { shared } = z.object({ shared: z.enum(['yes', 'no']) }).parse(await req.json());
    const r = await (await db()).collection('bookings').updateOne({ _id: oid(id), 'docs.id': docId }, { $set: { 'docs.$.shared': shared } });
    if (!r.matchedCount) throw new HttpError(404, 'Document not found.');
    await logActivity('booking', id, user.name, shared === 'yes' ? 'A document was made visible in the portal.' : 'A document was made internal only.');
    return getBooking(id);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id, docId } = await params;
    const col = (await db()).collection('bookings');
    const b = await col.findOne({ _id: oid(id) }, { projection: { docs: 1 } });
    const doc = ((b?.docs as { id: string; name: string; pathname?: string }[]) || []).find((x) => x.id === docId);
    if (!doc) throw new HttpError(404, 'Document not found.');
    if (doc.pathname) await del(doc.pathname).catch((e) => console.error('Could not delete file', e));
    await col.updateOne({ _id: oid(id) }, { $pull: { docs: { id: docId } } } as never);
    await logActivity('booking', id, user.name, `Document removed: ${doc.name}.`);
    return getBooking(id);
  });
}
