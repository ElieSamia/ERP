import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { leadSchema } from '@/lib/schemas';
import { listLeads, getLead } from '@/lib/queries';
import { logActivity } from '@/lib/activity';

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    return listLeads(new URL(req.url).searchParams.get('q')?.trim() || undefined);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const data = leadSchema.parse(await req.json());
    const d = await db();
    const c = await d.collection('contacts').findOne({ _id: oid(data.contactId) });
    if (!c || c.type === 'supplier') throw new HttpError(400, 'Choose a customer, agency or corporate account.');
    const r = await d.collection('leads').insertOne({ ...data, createdAt: new Date(), createdBy: user.name });
    await logActivity('lead', String(r.insertedId), user.name, 'Opportunity created.');
    return getLead(String(r.insertedId));
  });
}
