import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { productSchema } from '@/lib/schemas';
import { getProduct } from '@/lib/products';
import { logActivity } from '@/lib/activity';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const p = await getProduct((await params).id);
    if (!p) throw new HttpError(404, 'Product not found.');
    return p;
  });
}

/** Changing a product only affects services added from now on. Bookings keep the prices they were given. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const data = productSchema.parse(await req.json());
    const r = await (await db()).collection('products').updateOne({ _id: oid(id) }, { $set: { ...data, updatedAt: new Date(), updatedBy: user.name } });
    if (!r.matchedCount) throw new HttpError(404, 'Product not found.');
    await logActivity('product', id, user.name, data.active ? 'Product updated.' : 'Product updated and archived.');
    return getProduct(id);
  });
}

/** Deleting is for products never used. Products used on bookings are archived instead, so history stays readable. */
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const id = (await params).id;
    const p = await getProduct(id);
    if (!p) throw new HttpError(404, 'Product not found.');
    if (p.used) throw new HttpError(409, `This product is used on ${p.used} booking service${p.used === 1 ? '' : 's'}. Archive it instead.`);
    const d = await db();
    await d.collection('products').deleteOne({ _id: oid(id) });
    await d.collection('activity').deleteMany({ model: 'product', recordId: id });
    return { ok: true };
  });
}
