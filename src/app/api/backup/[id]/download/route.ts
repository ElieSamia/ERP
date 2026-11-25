import { ObjectId } from 'mongodb';
import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { load } from '@/lib/backup';

/** The backup file itself, still encrypted: keep it somewhere safe, away from the ERP. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser('admin');
    const id = (await params).id;
    const b = ObjectId.isValid(id) ? await (await db()).collection('backups').findOne({ _id: new ObjectId(id) }) : null;
    if (!b) throw new HttpError(404, 'Backup not found.');
    const buf = await load(String(b.path));
    return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${b.name}"`, 'Cache-Control': 'no-store' } });
  } catch (e) { return handle(async () => { throw e; }); }
}
