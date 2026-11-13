import { handle, HttpError } from '@/lib/api';
import { getPortalSettings, getRequestDoc, requirePortal } from '@/lib/portal';
import { attach, readForm } from '@/lib/attachments';

/** Customers attach passports and other papers to their own requests, if their role and the portal settings allow. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requirePortal((p) => p.requests === 'create' && p.documents === 'upload');
    if ((await getPortalSettings()).uploads !== 'yes') throw new HttpError(403, 'Uploads are switched off for the portal.');
    const id = (await params).id;
    const r = await getRequestDoc(id);
    if (!r || r.contactId !== ctx.contactId || (ctx.perms.scope === 'own' && r.createdById !== ctx.userId)) throw new HttpError(404, 'Request not found.');
    return attach('request', id, await readForm(req), `${ctx.name}, ${ctx.contactName}`);
  });
}
