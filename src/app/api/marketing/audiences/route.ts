import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { EMPTY_FILTER, toAudience } from '@/lib/marketing';
import { audienceSchema } from '@/lib/schemas';

export async function GET() {
  return handle(async () => {
    await requireUser();
    return (await (await db()).collection('audiences').find({}).sort({ name: 1 }).toArray()).map(toAudience);
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const data = audienceSchema.parse({ ...body, filter: { ...EMPTY_FILTER, ...(body.filter || {}) } });
    const r = await (await db()).collection('audiences').insertOne({ ...data, createdAt: new Date(), createdBy: user.name });
    return { id: String(r.insertedId) };
  });
}
