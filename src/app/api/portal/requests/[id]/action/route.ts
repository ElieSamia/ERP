import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid } from '@/lib/api';
import { addMessage, bookFromRequest, getPortalSettings, getRequestDoc, requirePortal, syncLead, toRequest } from '@/lib/portal';
import { logActivity } from '@/lib/activity';
import { money, todayISO, OPEN_REQ } from '@/lib/constants';

const schema = z.object({ action: z.enum(['message', 'accept', 'decline', 'approve', 'reject', 'cancel']), text: z.string().trim().max(4000).default('') });

/** What the customer can do on a request. Every rule here is checked against their role, not just hidden in the page. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requirePortal((p) => p.requests !== 'none');
    const id = (await params).id;
    const { action, text } = schema.parse(await req.json());
    const r = await getRequestDoc(id);
    if (!r || r.contactId !== ctx.contactId || (ctx.perms.scope === 'own' && r.createdById !== ctx.userId)) throw new HttpError(404, 'Request not found.');
    const who = `${ctx.name}, ${ctx.contactName}`;
    const col = (await db()).collection('requests');
    const p = ctx.perms;
    if (action === 'message') {
      if (p.requests !== 'create') throw new HttpError(403, 'Your access lets you follow requests, not reply to them.');
      if (!text) throw new HttpError(400, 'Write a message first.');
      if (!OPEN_REQ.includes(r.status)) throw new HttpError(409, 'This request is closed. Send a new request instead.');
      await addMessage(id, 'customer', who, text);
      await logActivity('request', id, who, 'Message from the customer.');
    } else if (action === 'cancel') {
      if (p.requests !== 'create' || !OPEN_REQ.includes(r.status)) throw new HttpError(409, 'This request can’t be cancelled.');
      await col.updateOne({ _id: oid(id) }, { $set: { status: 'cancelled' } });
      await addMessage(id, 'system', '', `Request cancelled by ${ctx.name}.`);
    } else if (action === 'accept' || action === 'decline') {
      if (r.status !== 'quoted' || !r.quote) throw new HttpError(409, 'There’s no quote waiting for an answer.');
      if (p.acceptQuotes !== 'yes') throw new HttpError(403, 'Your access doesn’t include accepting quotes.');
      if (r.quote.validUntil < todayISO()) throw new HttpError(409, 'This quote has expired. Send us a message to get an updated price.');
      if (action === 'decline') {
        await col.updateOne({ _id: oid(id) }, { $set: { status: 'review' } });
        await addMessage(id, 'system', '', `Quote declined by ${ctx.name}.${text ? ' ' : ''}`);
        if (text) await addMessage(id, 'customer', who, text);
      } else if (p.approveQuotes !== 'yes' && p.approvalLimit > 0 && Number(r.quote.amount) > p.approvalLimit) {
        await col.updateOne({ _id: oid(id) }, { $set: { status: 'approval', approvalBy: ctx.name } });
        await addMessage(id, 'system', '', `Quote accepted by ${ctx.name}. Waiting for approval because it’s above their ${money(p.approvalLimit)} limit.`);
      } else {
        await col.updateOne({ _id: oid(id) }, { $set: { status: 'accepted' } });
        await addMessage(id, 'system', '', `Quote accepted by ${ctx.name}.`);
        if ((await getPortalSettings()).autoBook === 'yes') await bookFromRequest(id, who);
      }
      await logActivity('request', id, who, `Quote ${action === 'accept' ? 'accepted' : 'declined'} in the portal.`);
    } else {
      if (r.status !== 'approval') throw new HttpError(409, 'Nothing is waiting for approval.');
      if (p.approveQuotes !== 'yes') throw new HttpError(403, 'Your access doesn’t include approving quotes.');
      if (action === 'reject') {
        await col.updateOne({ _id: oid(id) }, { $set: { status: 'review' }, $unset: { approvalBy: '' } });
        await addMessage(id, 'system', '', `Not approved by ${ctx.name}.`);
        if (text) await addMessage(id, 'customer', who, text);
      } else {
        await col.updateOne({ _id: oid(id) }, { $set: { status: 'accepted' } });
        await addMessage(id, 'system', '', `Quote approved by ${ctx.name}.`);
        if ((await getPortalSettings()).autoBook === 'yes') await bookFromRequest(id, who);
      }
      await logActivity('request', id, who, action === 'approve' ? 'Quote approved in the portal.' : 'Quote not approved in the portal.');
    }
    await syncLead(id, who);
    return toRequest((await getRequestDoc(id))!);
  });
}
