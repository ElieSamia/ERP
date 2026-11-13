import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { addMessage, bookFromRequest, getPortalSettings, getRequestDoc, requestWithNames, syncLead, toRequest } from '@/lib/portal';
import { logActivity } from '@/lib/activity';
import { addDays, fmtDate, money, todayISO, OPEN_REQ } from '@/lib/constants';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('review') }),
  z.object({ action: z.literal('quote'), amount: z.coerce.number().positive('Enter the price.'), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), notes: z.string().max(4000).default('') }),
  z.object({ action: z.literal('decline'), reason: z.string().trim().min(1, 'Give the customer a reason.').max(2000) }),
  z.object({ action: z.literal('book') }),
  z.object({ action: z.literal('message'), text: z.string().trim().min(1, 'Write a message first.').max(4000) }),
]);

/** What your team does with a portal request. Each step shows in the customer's thread and moves the CRM opportunity. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const body = schema.parse(await req.json());
    const r = await getRequestDoc(id);
    if (!r) throw new HttpError(404, 'Request not found.');
    const col = (await db()).collection('requests');
    const open = OPEN_REQ.includes(r.status);
    if (body.action === 'message') {
      await addMessage(id, 'staff', user.name, body.text);
      await logActivity('request', id, user.name, 'Message sent to the customer.');
    } else if (body.action === 'review') {
      if (r.status !== 'submitted') throw new HttpError(409, 'Only new requests can start review.');
      await col.updateOne({ _id: oid(id) }, { $set: { status: 'review' } });
      await addMessage(id, 'system', '', 'Our team is reviewing your request.');
      await logActivity('request', id, user.name, 'Review started.');
    } else if (body.action === 'quote') {
      if (!open) throw new HttpError(409, 'This request is closed.');
      const validUntil = body.validUntil || addDays(todayISO(), (await getPortalSettings()).quoteDays);
      if (validUntil < todayISO()) throw new HttpError(400, 'Set a validity date from today onwards.');
      await col.updateOne({ _id: oid(id) }, { $set: { status: 'quoted', quote: { amount: body.amount, validUntil, notes: body.notes, sentAt: todayISO() } }, $unset: { approvalBy: '' } });
      await addMessage(id, 'system', '', `Quote sent: ${money(body.amount)}, valid until ${fmtDate(validUntil)}.`);
      await logActivity('request', id, user.name, `Quote of ${money(body.amount)} sent.`);
    } else if (body.action === 'decline') {
      if (!open) throw new HttpError(409, 'This request is already closed.');
      await col.updateOne({ _id: oid(id) }, { $set: { status: 'declined' } });
      await addMessage(id, 'staff', user.name, body.reason);
      await addMessage(id, 'system', '', 'Request declined.');
      await logActivity('request', id, user.name, 'Declined.');
    } else {
      if (!['review', 'quoted', 'approval', 'accepted'].includes(r.status)) throw new HttpError(409, 'Start the review first, or the request is closed.');
      await bookFromRequest(id, user.name);
    }
    await syncLead(id, user.name);
    return requestWithNames(toRequest((await getRequestDoc(id))!));
  });
}
