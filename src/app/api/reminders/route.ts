import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { reminderSchema } from '@/lib/schemas';


/** A reminder on the shared calendar: a call to make, a document to chase, a visa appointment. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const data = reminderSchema.parse(await req.json());
    const r = await (await db()).collection('reminders').insertOne({ ...data, done: false, by: user.name, createdAt: new Date() });
    return { id: String(r.insertedId) };
  });
}
