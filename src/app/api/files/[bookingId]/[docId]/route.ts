import { get } from '@vercel/blob';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';

/** Streams a private file after checking the session. ?download=1 saves it instead of opening it. */
export async function GET(req: Request, { params }: { params: Promise<{ bookingId: string; docId: string }> }) {
  try {
    await requireUser();
    const { bookingId, docId } = await params;
    const b = await (await db()).collection('bookings').findOne({ _id: oid(bookingId) }, { projection: { docs: 1 } });
    const doc = ((b?.docs as { id: string; name: string; type: string; pathname?: string }[]) || []).find((x) => x.id === docId);
    if (!doc?.pathname) throw new HttpError(404, 'File not found.');
    const res = await get(doc.pathname, { access: 'private' });
    if (!res || res.statusCode !== 200) throw new HttpError(404, 'File not found in storage.');
    const download = new URL(req.url).searchParams.get('download') === '1';
    return new Response(res.stream, {
      headers: {
        'Content-Type': doc.type,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return handle(async () => { throw e; });
  }
}
