import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { campaignSchema } from '@/lib/schemas';
import { getCampaign } from '@/lib/marketing';

type Ctx = { params: Promise<{ id: string }> };
async function draft(id: string) {
  const c = await getCampaign(id);
  if (!c) throw new HttpError(404, 'Campaign not found.');
  if (c.status !== 'draft') throw new HttpError(409, 'This campaign was already sent or scheduled, so it can’t be changed. Duplicate it to send a new version.');
  return c;
}
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const id = (await params).id;
    await draft(id);
    await (await db()).collection('campaigns').updateOne({ _id: oid(id) }, { $set: { ...campaignSchema.parse(await req.json()), updatedAt: new Date(), error: '' } });
    return getCampaign(id);
  });
}
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const id = (await params).id;
    await draft(id);
    await (await db()).collection('campaigns').deleteOne({ _id: oid(id) });
    return { ok: true };
  });
}
