import { handle, HttpError } from '@/lib/api';
import { canSeeBooking, getRequestDoc, portalDocs, requirePortal, supplierDocs, supplierOrder } from '@/lib/portal';
import { openFile } from '@/lib/attachments';
import { publicDocs } from '@/lib/attachments';

/** A portal user opens a file only if they can see the booking or request and the file is shared with them. */
export async function GET(req: Request, { params }: { params: Promise<{ model: string; id: string; docId: string }> }) {
  try {
    const ctx = await requirePortal();
    const { model, id, docId } = await params;
    const download = new URL(req.url).searchParams.get('download') === '1';
    if (model === 'purchase') {
      const po = await supplierOrder(ctx, id);
      if (!po || !supplierDocs(po.docs).some((d) => d.id === docId)) throw new HttpError(404, 'File not found.');
      return await openFile('purchase', id, docId, download);
    }
    if (model === 'booking' && ctx.side === 'customer') {
      const b = await canSeeBooking(ctx, id);
      if (!b || !portalDocs(ctx, b.docs).some((d) => d.id === docId)) throw new HttpError(404, 'File not found.');
      return await openFile('booking', id, docId, download);
    }
    if (model === 'request' && ctx.side === 'customer') {
      const r = await getRequestDoc(id);
      if (!r || r.contactId !== ctx.contactId || ctx.perms.requests === 'none' || (ctx.perms.scope === 'own' && r.createdById !== ctx.userId)) throw new HttpError(404, 'File not found.');
      if (ctx.perms.documents === 'none' || !publicDocs(r.docs).some((d) => d.id === docId)) throw new HttpError(404, 'File not found.');
      return await openFile('request', id, docId, download);
    }
    throw new HttpError(404, 'File not found.');
  } catch (e) {
    return handle(async () => { throw e; });
  }
}
