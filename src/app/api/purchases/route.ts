import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { purchaseSchema } from '@/lib/schemas';
import { getPurchase, listPurchases, newPurchaseRef } from '@/lib/finance';
import { logActivity } from '@/lib/activity';

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    const p = new URL(req.url).searchParams;
    return listPurchases({ q: p.get('q')?.trim() || undefined, status: p.get('status') || undefined });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const data = purchaseSchema.parse(await req.json());
    const d = await db();
    const s = await d.collection('contacts').findOne({ _id: oid(data.supplierId) });
    if (!s || s.type !== 'supplier') throw new HttpError(400, 'Choose a supplier.');
    const ref = await newPurchaseRef();
    const r = await d.collection('purchases').insertOne({ ...data, ref, status: 'draft', payments: [], createdAt: new Date(), createdBy: user.name });
    await logActivity('purchase', String(r.insertedId), user.name, 'Request for quotation created.');
    return getPurchase(String(r.insertedId));
  });
}
