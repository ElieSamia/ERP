import { handle, HttpError } from '@/lib/api';
import { canSeeBooking, getRequestDoc, portalDocs, requirePortal, supplierDocs, supplierOrder } from '@/lib/portal';
import { openFile, removeDoc } from '@/lib/attachments';
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

/**
 * A portal user removes a file their side sent: suppliers on their orders, customers on their requests.
 * Files from your team are never removable here. Each removal is noted in the conversation and the activity log.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ model: string; id: string; docId: string }> }) {
  return handle(async () => {
    const ctx = await requirePortal();
    const { model, id, docId } = await params;
    const who = `${ctx.name}, ${ctx.contactName}`;
    if (model === 'purchase' && ctx.side === 'supplier') {
      const po = await supplierOrder(ctx, id);
      const doc = po?.docs.find((d) => d.id === docId);
      if (!po || !doc) throw new HttpError(404, 'File not found.');
      const allowed = ctx.perms.orders === 'respond' || (ctx.perms.bills === 'upload' && doc.kind === 'bill');
      if (!allowed) throw new HttpError(403, 'Your access doesn’t include removing this file.');
      return removeDoc('purchase', id, docId, who, { who: ctx.name, onlyFromPortal: true });
    }
    if (model === 'request' && ctx.side === 'customer') {
      const r = await getRequestDoc(id);
      if (!r || r.contactId !== ctx.contactId || (ctx.perms.scope === 'own' && r.createdById !== ctx.userId)) throw new HttpError(404, 'File not found.');
      if (ctx.perms.requests !== 'create' || ctx.perms.documents !== 'upload') throw new HttpError(403, 'Your access doesn’t include removing files.');
      return removeDoc('request', id, docId, who, { who: ctx.name, onlyFromPortal: true });
    }
    throw new HttpError(404, 'File not found.');
  });
}
