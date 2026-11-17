import { ObjectId, type Document, type WithId } from 'mongodb';
import { db } from './db';
import type { Product } from './constants';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | undefined));
export const toProduct = (d: WithId<Document>): Product => ({
  id: String(d._id), code: d.code || '', name: d.name, type: d.type, desc: d.desc || '', supplierId: d.supplierId || '',
  cost: Number(d.cost) || 0, pricing: d.pricing || 'channel', markup: Number(d.markup) || 0, vat: d.vat || 'default',
  active: d.active !== false, notes: d.notes || '', createdAt: iso(d.createdAt),
});

/** Products with their supplier's name and how many booking services use them. */
export async function listProducts(opts: { q?: string; type?: string; active?: 'yes' | 'no' | 'all' } = {}) {
  const d = await db();
  const f: Record<string, unknown> = {};
  if (opts.type && opts.type !== 'all') f.type = opts.type;
  if (opts.active === 'yes') f.active = { $ne: false };
  if (opts.active === 'no') f.active = false;
  if (opts.q) { const rx = { $regex: opts.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; f.$or = [{ name: rx }, { code: rx }, { desc: rx }]; }
  const list = (await d.collection('products').find(f).sort({ type: 1, name: 1 }).limit(1000).toArray()).map(toProduct);
  const ids = [...new Set(list.map((p) => p.supplierId).filter((x) => ObjectId.isValid(x)))].map((x) => new ObjectId(x));
  const sups = ids.length ? await d.collection('contacts').find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray() : [];
  const used = await d.collection('bookings').aggregate([
    { $unwind: '$lines' }, { $match: { 'lines.productId': { $in: list.map((p) => p.id) } } }, { $group: { _id: '$lines.productId', n: { $sum: 1 } } },
  ]).toArray();
  return list.map((p) => ({ ...p, supplierName: sups.find((s) => String(s._id) === p.supplierId)?.name, used: used.find((u) => u._id === p.id)?.n ?? 0 }));
}

export async function getProduct(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const d = await (await db()).collection('products').findOne({ _id: new ObjectId(id) });
  if (!d) return null;
  return (await listProducts({ q: undefined })).find((p) => p.id === id) ?? toProduct(d);
}
