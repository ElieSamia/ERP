import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError } from '@/lib/api';
import { addMessage, leadFromRequest, nextRequestRef, requirePortal, toRequest } from '@/lib/portal';
import { logActivity } from '@/lib/activity';

const iso = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default('');
const schema = z.object({
  type: z.enum(['flight', 'hotel', 'transfer', 'visa', 'package', 'insurance', 'other']),
  title: z.string().trim().min(1, 'Say briefly what you need, for example “Hotel in Paris for 2”.').max(200),
  destination: z.string().trim().min(1, 'Add the destination.').max(120),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Add the travel or service date.'),
  dateTo: iso,
  adults: z.coerce.number().int().min(1, 'Add at least one adult.').max(500),
  children: z.coerce.number().int().min(0).max(500).default(0),
  budget: z.coerce.number().min(0).default(0),
  travellers: z.string().max(4000).default(''),
  details: z.string().max(8000).default(''),
}).refine((r) => !r.dateTo || r.dateTo >= r.dateFrom, { message: 'The end date is before the start date.', path: ['dateTo'] });

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requirePortal((p) => p.requests === 'create');
    const data = schema.parse(await req.json());
    const ref = await nextRequestRef();
    const r = await (await db()).collection('requests').insertOne({
      ...data, ref, contactId: ctx.contactId, createdById: ctx.userId, createdBy: ctx.name, status: 'submitted', quote: null, messages: [], docs: [], createdAt: new Date(),
    });
    const id = String(r.insertedId);
    await addMessage(id, 'system', '', 'Request submitted.');
    await logActivity('request', id, `${ctx.name}, ${ctx.contactName}`, 'Submitted from the portal.');
    await leadFromRequest(id, 'Portal');
    const doc = await (await db()).collection('requests').findOne({ _id: r.insertedId });
    if (!doc) throw new HttpError(500, 'Something went wrong. Try again.');
    return toRequest(doc);
  });
}
