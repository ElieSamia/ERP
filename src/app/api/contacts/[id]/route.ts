import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { contactSchema } from '@/lib/schemas';
import { logActivity } from '@/lib/activity';
import { out } from '@/lib/serialize';
import { label, CONTACT_TYPES, money } from '@/lib/constants';
import type { Contact } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const d = await (await db()).collection('contacts').findOne({ _id: oid((await params).id) });
    if (!d) throw new HttpError(404, 'Contact not found.');
    return out<Contact>(d);
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const col = (await db()).collection('contacts');
    const before = await col.findOne({ _id: oid(id) });
    if (!before) throw new HttpError(404, 'Contact not found.');
    const data = contactSchema.parse(await req.json());
    await col.updateOne({ _id: oid(id) }, { $set: { ...data, updatedAt: new Date(), updatedBy: user.name } });
    const changes: string[] = [];
    if (before.type !== data.type) changes.push(`Type changed to ${label(CONTACT_TYPES, data.type)}.`);
    if (Number(before.creditLimit) !== data.creditLimit) changes.push(`Credit limit changed to ${money(data.creditLimit)}.`);
    if (before.portalAccess !== data.portalAccess) changes.push(`Portal access ${data.portalAccess === 'yes' ? 'turned on' : 'turned off'}.`);
    if (before.marketing !== data.marketing) changes.push(data.marketing === 'yes' ? 'Subscribed to marketing.' : 'Unsubscribed from marketing.');
    await logActivity('contact', id, user.name, changes.length ? changes.join(' ') : 'Details updated.');
    return out<Contact>((await col.findOne({ _id: oid(id) }))!);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const id = (await params).id;
    const d = await db();
    const used = await d.collection('leads').countDocuments({ contactId: id }, { limit: 1 });
    if (used) throw new HttpError(409, 'This contact has opportunities, so it can’t be deleted.');
    const r = await d.collection('contacts').deleteOne({ _id: oid(id) });
    if (!r.deletedCount) throw new HttpError(404, 'Contact not found.');
    await d.collection('activity').deleteMany({ model: 'contact', recordId: id });
    return { ok: true };
  });
}
