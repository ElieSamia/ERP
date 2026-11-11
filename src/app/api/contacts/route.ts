import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { contactSchema, quickContactSchema } from '@/lib/schemas';
import { listContacts } from '@/lib/queries';
import { logActivity } from '@/lib/activity';
import { out } from '@/lib/serialize';
import type { Contact } from '@/lib/types';

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    const p = new URL(req.url).searchParams;
    return listContacts({
      q: p.get('q')?.trim() || undefined,
      type: p.get('type') || undefined,
      customersOnly: p.get('customers') === '1',
      limit: Math.min(Number(p.get('limit') || 50), 200),
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const data = body.quick ? contactSchema.parse({ ...quickContactSchema.parse(body), creditLimit: 0 }) : contactSchema.parse(body);
    const col = (await db()).collection('contacts');
    const r = await col.insertOne({ ...data, createdAt: new Date(), createdBy: user.name });
    await logActivity('contact', String(r.insertedId), user.name, body.quick ? 'Created from a quick-create form.' : 'Contact created.');
    return out<Contact>((await col.findOne({ _id: r.insertedId }))!);
  });
}
