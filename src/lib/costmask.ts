import { sell, r2 } from './constants';
import type { Booking, BookingLine } from './types';

/**
 * For roles without "See costs and margins": each service keeps its selling price, but its cost and markup are
 * replaced (price = 0 + a fixed amount), and provider amounts are removed. Internal notes can describe costs,
 * so they're hidden too. Saving puts the real costs back (see keepCosts).
 */
export function maskLines(lines: BookingLine[]): BookingLine[] {
  return lines.map((l) => {
    const api = l.api ? { ...l.api, amount: undefined, currency: undefined, fee: undefined } : undefined;
    return { ...l, cost: 0, markup: r2(sell(l)), markupType: 'amount', fixedMarkup: true, api };
  });
}
export function maskBooking<T extends Booking>(b: T): T {
  return { ...b, lines: maskLines(b.lines), notes: b.notes ? 'Internal notes are visible to roles with access to costs.' : '' };
}
/**
 * When someone without costs saves a booking: existing services keep their real cost and markup (whatever the
 * form sent), and new services arrive unpriced, for someone with access to price them. Notes stay as they were.
 */
export function keepCosts(incoming: BookingLine[], before: BookingLine[]): BookingLine[] {
  const old = new Map(before.map((l) => [l.id, l]));
  return incoming.map((l) => {
    const o = old.get(l.id);
    return o ? { ...l, cost: o.cost, markup: o.markup, markupType: o.markupType, fixedMarkup: o.fixedMarkup } : { ...l, cost: 0, markup: 0, markupType: 'percent' as const, fixedMarkup: false };
  });
}

/**
 * New services added from the catalogue by someone without costs: they take the product's own cost and markup
 * for the customer's channel (as they would for anyone), so a catalogue product is priced without revealing its cost.
 * Other new services stay unpriced.
 */
export async function priceFromCatalogue(lines: BookingLine[], before: BookingLine[], contactId: string): Promise<BookingLine[]> {
  const { db } = await import('./db');
  const { ObjectId } = await import('mongodb');
  const { getPricing } = await import('./bookings');
  const { CHANNEL, productMarkup } = await import('./constants');
  const old = new Set(before.map((l) => l.id));
  const fresh = lines.filter((l) => !old.has(l.id) && l.productId && ObjectId.isValid(l.productId));
  if (!fresh.length) return lines;
  const d = await db();
  const c = ObjectId.isValid(contactId) ? await d.collection('contacts').findOne({ _id: new ObjectId(contactId) }, { projection: { type: 1 } }) : null;
  const ch = CHANNEL[String(c?.type ?? 'customer')] ?? 'B2C';
  const pricing = await getPricing();
  const prods = new Map((await d.collection('products').find({ _id: { $in: fresh.map((l) => new ObjectId(l.productId!)) } }).toArray()).map((p) => [String(p._id), p]));
  return lines.map((l) => {
    const p = !old.has(l.id) && l.productId ? prods.get(l.productId) : undefined;
    if (!p) return l;
    const m = productMarkup({ pricing: p.pricing, markup: Number(p.markup) || 0 }, ch, pricing);
    return { ...l, cost: Number(p.cost) || 0, markup: m.markup, markupType: m.markupType, fixedMarkup: p.pricing !== 'channel' };
  });
}
