import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { reminderSchema } from '@/lib/schemas';

type Ctx = { params: Promise<{ id: string }> };

/** Edit a reminder, or tick it done. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const data = reminderSchema.partial().extend({ done: z.boolean().optional() }).parse(await req.json());
    const r = await (await db()).collection('reminders').updateOne({ _id: oid((await params).id) }, { $set: { ...data, updatedAt: new Date(), updatedBy: user.name, ...(data.done ? { doneBy: user.name, doneAt: new Date() } : {}) } });
    if (!r.matchedCount) throw new HttpError(404, 'Reminder not found.');
    return { ok: true };
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const r = await (await db()).collection('reminders').deleteOne({ _id: oid((await params).id) });
    if (!r.deletedCount) throw new HttpError(404, 'Reminder not found.');
    return { ok: true };
  });
}
