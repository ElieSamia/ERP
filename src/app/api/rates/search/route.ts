import { accessFor } from '@/lib/roles';
import { getPricing } from '@/lib/bookings';
import { sell } from '@/lib/constants';
import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { searchAll } from '@/lib/rates';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the dates.');
const opt = z.union([z.literal(''), date]).default('');
const code = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use 3-letter airport codes, like BEY.');
const schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('flight'), q: z.object({ origin: code, destination: code, depart: date, ret: opt, adults: z.coerce.number().int().min(1).max(9), children: z.coerce.number().int().min(0).max(9).default(0), cabin: z.enum(['economy', 'business']) }) }),
  z.object({ kind: z.literal('hotel'), q: z.object({ destination: z.string().trim().min(2, 'Where to?').max(80), checkIn: date, checkOut: date, rooms: z.coerce.number().int().min(1).max(9), adults: z.coerce.number().int().min(1).max(30), children: z.coerce.number().int().min(0).max(20).default(0) }) }),
  z.object({ kind: z.literal('transfer'), q: z.object({ from: z.string().trim().min(2, 'From where?').max(80), to: z.string().trim().min(2, 'To where?').max(80), date, time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time.'), passengers: z.coerce.number().int().min(1).max(50) }) }),
  z.object({ kind: z.literal('insurance'), q: z.object({ destination: z.string().trim().min(2, 'Where to?').max(80), start: date, end: date, travellers: z.coerce.number().int().min(1).max(30) }) }),
]);

/** One search across every active provider that sells this kind. */
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const body = await req.json();
    const query = schema.parse(body);
    const channel = ['B2C', 'B2B', 'Corporate'].includes(body?.channel) ? body.channel as 'B2C' | 'B2B' | 'Corporate' : 'B2C';
    const q = query.q as unknown as Record<string, string>;
    const [a, b] = query.kind === 'flight' ? [q.depart, q.ret] : query.kind === 'hotel' ? [q.checkIn, q.checkOut] : query.kind === 'insurance' ? [q.start, q.end] : [q.date, ''];
    if (a < new Date().toISOString().slice(0, 10)) throw new HttpError(400, 'The dates are in the past.');
    if (b && b < a) throw new HttpError(400, 'The end date is before the start date.');
    if (query.kind === 'hotel' && b === a) throw new HttpError(400, 'Check-out must be at least one night after check-in.');
    const res = await searchAll(query);
    if ((await accessFor(me.sub, me.role)).costs) return res;
    // Without access to costs: each result carries its selling price for this customer's channel, never the cost.
    const pricing = await getPricing();
    const price = (c: number) => sell({ cost: c, markup: pricing[channel], markupType: pricing.modes?.[channel] ?? 'percent' });
    return { ...res, results: res.results.map((r) => ({ ...r, costUSD: price(r.costUSD), amount: price(r.costUSD), currency: 'USD', priced: true })) };
  });
}
