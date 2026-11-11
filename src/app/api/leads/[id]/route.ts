import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { leadSchema } from '@/lib/schemas';
import { getLead } from '@/lib/queries';
import { logActivity } from '@/lib/activity';
import { label, LEAD_STAGES } from '@/lib/constants';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const l = await getLead((await params).id);
    if (!l) throw new HttpError(404, 'Opportunity not found.');
    return l;
  });
}

/** Accepts the whole form, or only { stage } when a card is dragged in the pipeline. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const d = await db();
    const before = await d.collection('leads').findOne({ _id: oid(id) });
    if (!before) throw new HttpError(404, 'Opportunity not found.');
    const data = leadSchema.partial().parse(await req.json());
    if (data.contactId && data.contactId !== before.contactId) {
      const c = await d.collection('contacts').findOne({ _id: oid(data.contactId) });
      if (!c || c.type === 'supplier') throw new HttpError(400, 'Choose a customer, agency or corporate account.');
    }
    await d.collection('leads').updateOne({ _id: oid(id) }, { $set: { ...data, updatedAt: new Date(), updatedBy: user.name } });
    if (data.stage && data.stage !== before.stage) await logActivity('lead', id, user.name, `Stage changed to ${label(LEAD_STAGES, data.stage)}.`);
    if (Object.keys(data).some((k) => k !== 'stage')) await logActivity('lead', id, user.name, 'Details updated.');
    return getLead(id);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const id = (await params).id;
    const d = await db();
    const r = await d.collection('leads').deleteOne({ _id: oid(id) });
    if (!r.deletedCount) throw new HttpError(404, 'Opportunity not found.');
    await d.collection('activity').deleteMany({ model: 'lead', recordId: id });
    return { ok: true };
  });
}
