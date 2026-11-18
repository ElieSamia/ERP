import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { campaignSchema } from '@/lib/schemas';

/** A new campaign starts as a draft. Nothing is sent until someone selects Send. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const data = campaignSchema.parse(await req.json());
    const r = await (await db()).collection('campaigns').insertOne({ ...data, status: 'draft', recipients: 0, stats: null, createdAt: new Date(), createdBy: user.name });
    return { id: String(r.insertedId) };
  });
}
