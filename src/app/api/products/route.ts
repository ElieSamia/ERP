import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { productSchema } from '@/lib/schemas';
import { getProduct, listProducts } from '@/lib/products';
import { logActivity } from '@/lib/activity';

/** The catalogue, for the Products page and the "Add from catalogue" picker on bookings. */
export async function GET(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const p = new URL(req.url).searchParams;
    const list = await listProducts({ q: p.get('q') ?? undefined, type: p.get('type') ?? undefined, active: (p.get('active') as 'yes' | 'no' | 'all') ?? 'yes' });
    if ((await (await import('@/lib/roles')).accessFor(me.sub, me.role)).costs) return list;
    // Without access to costs: each product's selling price per channel, and no cost.
    const { getPricing } = await import('@/lib/bookings');
    const { productMarkup, sell } = await import('@/lib/constants');
    const pricing = await getPricing();
    return list.map((x) => ({ ...x, cost: 0, markup: 0, prices: Object.fromEntries((['B2C', 'B2B', 'Corporate'] as const).map((ch) => [ch, sell({ cost: x.cost, ...productMarkup(x, ch, pricing) })])) }));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const data = productSchema.parse(await req.json());
    const r = await (await db()).collection('products').insertOne({ ...data, createdAt: new Date(), createdBy: user.name });
    await logActivity('product', String(r.insertedId), user.name, 'Product created.');
    return getProduct(String(r.insertedId));
  });
}
