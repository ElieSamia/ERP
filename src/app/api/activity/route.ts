import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { getActivity } from '@/lib/queries';
import { logActivity } from '@/lib/activity';

const COLLECTION = { contact: 'contacts', lead: 'leads', booking: 'bookings' } as const;
const noteSchema = z.object({ model: z.enum(['contact', 'lead', 'booking']), id: z.string(), text: z.string().trim().min(1, 'Write a note first.').max(4000) });

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    const p = new URL(req.url).searchParams;
    const model = z.enum(['contact', 'lead', 'booking']).parse(p.get('model'));
    return getActivity(model, String(p.get('id') || ''));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { model, id, text } = noteSchema.parse(await req.json());
    const exists = await (await db()).collection(COLLECTION[model]).countDocuments({ _id: oid(id) }, { limit: 1 });
    if (!exists) throw new HttpError(404, 'Record not found.');
    await logActivity(model, id, user.name, `Note: ${text}`);
    return getActivity(model, id);
  });
}
