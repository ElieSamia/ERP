import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { getBooking } from '@/lib/bookings';
import { logActivity } from '@/lib/activity';
import { DOC_KINDS, label } from '@/lib/constants';

const MAX_BYTES = 4 * 1024 * 1024;

/** Uploads a file to the private Blob store. Files are only ever read back through /api/files after a sign-in check. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)
      throw new HttpError(503, 'File storage isn’t connected yet. In Vercel, open Storage, create a private Blob store and connect it to this project.');
    const col = (await db()).collection('bookings');
    const b = await col.findOne({ _id: oid(id) }, { projection: { ref: 1 } });
    if (!b) throw new HttpError(404, 'Booking not found.');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) throw new HttpError(400, 'Choose a file to attach.');
    if (file.size > MAX_BYTES) throw new HttpError(413, 'That file is over 4 MB. Attach a smaller file.');
    if (!/^image\/(jpeg|png|webp|gif)$|^application\/pdf$/.test(file.type)) throw new HttpError(415, 'Attach a JPG, PNG or WebP image, or a PDF.');
    const kind = String(form.get('kind') || 'other');
    if (!DOC_KINDS.some(([k]) => k === kind)) throw new HttpError(400, 'Choose the document type.');
    const traveller = String(form.get('traveller') || '').slice(0, 120);
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';
    const blob = await put(`bookings/${id}/${safe}`, file, { access: 'private', addRandomSuffix: true, contentType: file.type });
    const doc = {
      id: randomUUID(), kind, traveller, name: file.name.slice(0, 160), size: file.size, type: file.type,
      pathname: blob.pathname, at: new Date().toISOString(), by: user.name, shared: 'yes',
    };
    await col.updateOne({ _id: oid(id) }, { $push: { docs: doc } } as never);
    await logActivity('booking', id, user.name, `${label(DOC_KINDS, kind)} attached: ${doc.name}.`);
    return getBooking(id);
  });
}
