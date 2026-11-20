import { randomBytes } from 'crypto';
import { ObjectId, type Document, type WithId } from 'mongodb';
import { db } from '../db';
import { decrypt, encrypt } from '../mail';
import { HttpError } from '../api';
import { getAccSettings, rateOf } from '../accounting';
import { logActivity } from '../activity';
import { r2, travList, type MarkupType } from '../constants';
import { providerMeta } from './registry';
import type { Connector, Offer, Query, RateKind, Traveller } from './types';
import { travellerDetails } from '../travellers';

/* ---------- Connections: one per provider account, credentials encrypted ---------- */
export type Connection = {
  id: string; provider: string; name: string; kinds: RateKind[]; mode: 'test' | 'live'; supplierId: string; active: boolean;
  hasCredentials: boolean; credentialKeys: string[]; createdAt?: string;
};
export const toConnection = (d: WithId<Document>): Connection => {
  const creds = d.credentialsEnc ? (JSON.parse(decrypt(String(d.credentialsEnc))) as Record<string, string>) : {};
  return {
    id: String(d._id), provider: d.provider, name: d.name, kinds: d.kinds || [], mode: d.mode === 'live' ? 'live' : 'test', supplierId: d.supplierId || '',
    active: d.active !== false, hasCredentials: Object.values(creds).some(Boolean), credentialKeys: Object.keys(creds).filter((k) => creds[k]),
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : undefined,
  };
};
export async function listConnections() {
  return (await (await db()).collection('connections').find({}).sort({ name: 1 }).toArray()).map(toConnection);
}
export const sealCredentials = (c: Record<string, string>) => encrypt(JSON.stringify(c));

/** A provider's connector, wrapped so every call is timed, logged and turned into a readable error. */
async function connector(id: string): Promise<{ conn: Connection; c: Connector; raw: WithId<Document> }> {
  const d = await db();
  const raw = ObjectId.isValid(id) ? await d.collection('connections').findOne({ _id: new ObjectId(id) }) : null;
  if (!raw) throw new HttpError(404, 'That provider connection no longer exists.');
  const meta = providerMeta(raw.provider);
  if (!meta) throw new HttpError(400, `The ERP doesn’t know the provider “${raw.provider}”.`);
  const creds = raw.credentialsEnc ? (JSON.parse(decrypt(String(raw.credentialsEnc))) as Record<string, string>) : {};
  const inner = meta.create(creds, raw.mode === 'live' ? 'live' : 'test');
  const conn = toConnection(raw);
  type Op = 'search' | 'recheck' | 'reserve' | 'cancel' | 'check' | 'issue';
  const logged = <K extends Op>(op: K) => (async (...args: Parameters<NonNullable<Connector[K]>>) => {
    if (!inner[op]) throw new Error('This provider doesn’t support that step.');
    const t0 = Date.now();
    try {
      const r = await (inner[op] as (...a: unknown[]) => Promise<unknown>)(...args);
      await d.collection('ratelog').insertOne({ connectionId: conn.id, at: new Date(), op, ms: Date.now() - t0, ok: true, summary: summary(op, args, r) }).catch(() => null);
      return r;
    } catch (e) {
      const msg = (e as Error).message || 'The provider returned an error.';
      await d.collection('ratelog').insertOne({ connectionId: conn.id, at: new Date(), op, ms: Date.now() - t0, ok: false, error: msg.slice(0, 500), summary: summary(op, args) }).catch(() => null);
      // A 400 from the connector is our own check (missing details, wrong token type): something to fix, not a provider failure.
      const status = (e as { status?: number }).status === 400 ? 400 : 502;
      throw new HttpError(status, `${conn.name}: ${msg}`);
    }
  }) as NonNullable<Connector[K]>;
  return { conn, raw, c: { search: logged('search'), recheck: logged('recheck'), reserve: logged('reserve'), cancel: logged('cancel'), check: logged('check'), ...(inner.issue ? { issue: logged('issue') } : {}) } };
}
function summary(op: string, args: unknown[], r?: unknown) {
  if (op === 'search') { const q = args[0] as Query; return `${q.kind} ${JSON.stringify(q.q)}${Array.isArray(r) ? ` → ${r.length} offers` : ''}`; }
  if (op === 'reserve' || op === 'recheck' || op === 'cancel' || op === 'issue') { const o = (op === 'cancel' || op === 'issue' ? args[1] : args[0]) as Offer; return `${o?.title ?? ''} (${o?.id ?? ''})${r ? ` → ${JSON.stringify(r).slice(0, 160)}` : ''}`; }
  return String(r ?? '').slice(0, 160);
}
export async function checkConnection(id: string) { return (await connector(id)).c.check(); }

/** Provider amounts in the books' currency (USD), using the exchange rates in Accounting settings. */
async function toUSD(amount: number, currency: string) {
  if (!currency || currency === 'USD') return r2(amount);
  const rate = rateOf(await getAccSettings(), currency);
  if (!rate || rate === 1) throw new HttpError(400, `Add an exchange rate for ${currency} under Accounting → Settings.`);
  return r2(amount / rate);
}

/* ---------- Searching ---------- */
export type Result = Offer & { token: string; connectionId: string; provider: string; costUSD: number };

/** Searches every active connection that sells this kind, in parallel; a slow or failing provider doesn't stop the others. */
export async function searchAll(query: Query) {
  const conns = (await listConnections()).filter((c) => c.active && c.kinds.includes(query.kind));
  if (!conns.length) throw new HttpError(400, `No active connection sells ${query.kind === 'insurance' ? 'insurance' : `${query.kind}s`} yet. Add one under Connections.`);
  const d = await db();
  const out: Result[] = [];
  const errors: { provider: string; error: string }[] = [];
  await Promise.all(conns.map(async (conn) => {
    try {
      const { c } = await connector(conn.id);
      const offers = await Promise.race([c.search(query), new Promise<never>((_, rej) => setTimeout(() => rej(new HttpError(504, `${conn.name}: no answer within 25 seconds.`)), 25000))]);
      // Kept for 3 hours, so a result can be added to a quote or booking after the search. Written in one batch.
      const rows = await Promise.all(offers.map(async (o) => ({ o, token: randomBytes(12).toString('base64url'), costUSD: await toUSD(o.amount, o.currency) })));
      if (rows.length) await d.collection('offers').insertMany(rows.map((r) => ({ _id: r.token as unknown as ObjectId, connectionId: conn.id, provider: conn.name, query, offer: r.o, costUSD: r.costUSD, createdAt: new Date(), expiresAt: new Date(Date.now() + 3 * 3600e3) })));
      for (const r of rows) out.push({ ...r.o, token: r.token, connectionId: conn.id, provider: conn.name, costUSD: r.costUSD });
    } catch (e) { errors.push({ provider: conn.name, error: (e as Error).message }); }
  }));
  return { results: out.sort((a, b) => a.costUSD - b.costUSD), errors };
}

/* ---------- From results to booking lines ---------- */
export type ApiRef = {
  connectionId: string; provider: string; offer: Offer; currency: string; amount: number;
  /** The search that found it, kept so an expired offer can be found again. */
  query?: Query;
  status: 'quoted' | 'held' | 'confirmed' | 'cancelled'; providerRef?: string; reference?: string; timeLimit?: string; deadline?: string; note?: string; fee?: number;
};

const ddmmyyyy = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso ?? '');
/** Adds a dated line to the booking's internal notes, so the reservation history is readable in one place. */
async function noteLine(bookingId: ObjectId, text: string, by: string) {
  const d = await db();
  const b = await d.collection('bookings').findOne({ _id: bookingId }, { projection: { notes: 1 } });
  const line = `${ddmmyyyy(new Date().toISOString().slice(0, 10))}, ${by}: ${text}`;
  await d.collection('bookings').updateOne({ _id: bookingId }, { $set: { notes: [String(b?.notes || '').trim(), line].filter(Boolean).join('\n') } });
}
const TYPE: Record<RateKind, string> = { flight: 'flight', hotel: 'hotel', transfer: 'transfer', insurance: 'insurance' };

export async function offerLines(tokens: string[], markup: number, markupType: MarkupType) {
  const d = await db();
  const docs = await d.collection('offers').find({ _id: { $in: tokens as unknown as ObjectId[] } }).toArray();
  if (docs.length !== tokens.length) throw new HttpError(410, 'Some results have expired. Search again.');
  const conns = await listConnections();
  return docs.map((x) => {
    const o = x.offer as Offer, conn = conns.find((c) => c.id === x.connectionId);
    const api: ApiRef = { connectionId: String(x.connectionId), provider: String(x.provider), offer: o, query: x.query as Query | undefined, currency: o.currency, amount: o.amount, status: 'quoted', deadline: o.cancelDeadline, timeLimit: o.timeLimit };
    return { id: randomBytes(8).toString('hex'), type: TYPE[o.kind], desc: [o.title, ...o.lines].join('\n'), date: o.date, dateTo: o.dateTo, supplierId: conn?.supplierId ?? '', cost: Number(x.costUSD), markup, markupType, api };
  });
}

/* ---------- Reserving and cancelling a booking line with its provider ---------- */
export async function reserveLine(bookingId: string, lineId: string, acceptPrice: number | null, by: string) {
  const d = await db();
  const b = await d.collection('bookings').findOne({ _id: new ObjectId(bookingId) });
  if (!b) throw new HttpError(404, 'Booking not found.');
  if (b.status === 'cancelled') throw new HttpError(409, 'This booking is cancelled.');
  const l = (b.lines as { id: string; cost: number; api?: ApiRef }[]).find((x) => x.id === lineId);
  if (!l?.api) throw new HttpError(404, 'That service didn’t come from a provider.');
  if (l.api.status !== 'quoted') throw new HttpError(409, `Already ${l.api.status === 'cancelled' ? 'cancelled' : 'reserved'} with ${l.api.provider}.`);
  const { c } = await connector(l.api.connectionId);
  let offer = l.api.offer;
  let now = await c.recheck(offer);
  let refreshed = false;
  // Offers expire (Duffel's after about 30 minutes). Search again and take the same service if it's still sold.
  if (!now) {
    const fresh = await findSame(c, l.api, by);
    if (!fresh) throw new HttpError(409, `${l.api.provider} no longer sells this exact option. Search the Rates desk again for alternatives.`);
    offer = fresh; now = { amount: fresh.amount, currency: fresh.currency }; refreshed = true;
    await d.collection('bookings').updateOne({ _id: b._id, 'lines.id': lineId }, { $set: { 'lines.$.api.offer': fresh, 'lines.$.api.amount': fresh.amount, 'lines.$.api.currency': fresh.currency, 'lines.$.api.timeLimit': fresh.timeLimit ?? null } });
    await noteLine(b._id, `Offer for ${offer.title} had expired at ${l.api.provider}; the same option was found again (new offer ${fresh.id}, ${fresh.currency} ${fresh.amount.toFixed(2)}).`, by);
  }
  const newCost = await toUSD(now.amount, now.currency);
  if (Math.abs(newCost - l.cost) > 0.009 && acceptPrice !== newCost) {
    throw Object.assign(new HttpError(409, `The price changed from $${l.cost.toFixed(2)} to $${newCost.toFixed(2)}. Accept the new price to reserve.`), { extra: { newCost } });
  }
  // Names from the booking, with the details entered under Traveller details (date of birth, passport, contact).
  const travellers: Traveller[] = await travellerDetails(b);
  if (!travellers.length) throw new HttpError(400, 'Add the travellers’ names to the booking first: the provider needs them.');
  let res;
  try {
    res = await c.reserve({ ...offer, amount: now.amount, currency: now.currency }, travellers, String(b.ref));
  } catch (e) {
    // The offer can still expire between the price check and the booking: refresh once and ask again.
    if (!refreshed && /another offer|no longer available|expired|latest availability/i.test((e as Error).message)) {
      const fresh = await findSame(c, l.api, by);
      if (fresh) {
        await d.collection('bookings').updateOne({ _id: b._id, 'lines.id': lineId }, { $set: { 'lines.$.api.offer': fresh, 'lines.$.api.amount': fresh.amount, 'lines.$.api.currency': fresh.currency } });
        const freshCost = await toUSD(fresh.amount, fresh.currency);
        throw Object.assign(new HttpError(409, `The offer had just expired at ${l.api.provider}. The same option is available at $${freshCost.toFixed(2)}; reserve again to book it.`), { extra: freshCost !== l.cost ? { newCost: freshCost } : {} });
      }
      throw new HttpError(409, `${l.api.provider} no longer sells this exact option. Search the Rates desk again for alternatives.`);
    }
    throw e;
  }
  const api: ApiRef = { ...l.api, offer, status: res.status, providerRef: res.providerRef, reference: res.reference, timeLimit: res.timeLimit ?? l.api.timeLimit, note: res.note, amount: now.amount, currency: now.currency };
  // The PNR or confirmation number joins the service's first line, so it prints on the confirmation the customer gets.
  const tag = res.reference ? `${l.api.offer.kind === 'flight' ? 'PNR' : 'Confirmation'} ${res.reference}` : '';
  const desc = String((l as { desc?: string }).desc ?? '');
  const [head, ...rest] = desc.split('\n');
  const newDesc = tag && !head.includes(tag) ? [`${head} · ${tag}`, ...rest].join('\n') : desc;
  await d.collection('bookings').updateOne({ _id: b._id, 'lines.id': lineId }, { $set: { 'lines.$.api': api, 'lines.$.cost': newCost, 'lines.$.desc': newDesc } });
  await noteLine(b._id, `${res.status === 'held' ? 'Held' : 'Reserved'} with ${l.api.provider}: ${l.api.offer.title}${tag ? `, ${tag}` : ''}${res.providerRef !== res.reference ? ` (provider order ${res.providerRef})` : ''}${res.status === 'held' && api.timeLimit ? `, ticket by ${ddmmyyyy(api.timeLimit)}` : ''}${newCost !== l.cost ? `, cost updated to USD ${newCost.toFixed(2)}` : ''}.`, by);
  await logActivity('booking', bookingId, by, `${res.status === 'held' ? 'Held' : 'Reserved'} with ${l.api.provider}: ${res.note ?? res.providerRef}.${newCost !== l.cost ? ` Cost updated to $${newCost.toFixed(2)}.` : ''}`);
  return api;
}

export async function cancelLine(bookingId: string, lineId: string, by: string) {
  const d = await db();
  const b = await d.collection('bookings').findOne({ _id: new ObjectId(bookingId) });
  const l = (b?.lines as { id: string; api?: ApiRef }[] | undefined)?.find((x) => x.id === lineId);
  if (!b || !l?.api) throw new HttpError(404, 'Service not found.');
  if (!l.api.providerRef || l.api.status === 'cancelled') throw new HttpError(409, 'There’s no reservation to cancel.');
  const { c } = await connector(l.api.connectionId);
  const r = await c.cancel(l.api.providerRef, l.api.offer);
  const fee = await toUSD(r.fee, r.currency);
  await d.collection('bookings').updateOne({ _id: b._id, 'lines.id': lineId }, { $set: { 'lines.$.api.status': 'cancelled', 'lines.$.api.fee': fee } });
  await noteLine(b._id, `Cancelled with ${l.api.provider}: ${l.api.offer.title}${l.api.reference ? `, ${l.api.offer.kind === 'flight' ? 'PNR' : 'confirmation'} ${l.api.reference}` : ''}; ${fee ? `cancellation fee USD ${fee.toFixed(2)}` : 'no fee'}.`, by);
  await logActivity('booking', bookingId, by, `Reservation ${l.api.providerRef} cancelled with ${l.api.provider}${fee ? `; cancellation fee $${fee.toFixed(2)}` : ', no fee'}.`);
  return { fee };
}

/** Issues a held reservation (for flights: pays and tickets it before the time limit). */
export async function issueLine(bookingId: string, lineId: string, by: string) {
  const d = await db();
  const b = await d.collection('bookings').findOne({ _id: new ObjectId(bookingId) });
  const l = (b?.lines as { id: string; api?: ApiRef }[] | undefined)?.find((x) => x.id === lineId);
  if (!b || !l?.api) throw new HttpError(404, 'Service not found.');
  if (l.api.status !== 'held' || !l.api.providerRef) throw new HttpError(409, 'Only a held reservation can be issued.');
  const { c } = await connector(l.api.connectionId);
  if (!c.issue) throw new HttpError(400, `${l.api.provider} doesn’t support issuing from the ERP.`);
  const r = await c.issue(l.api.providerRef, l.api.offer);
  await d.collection('bookings').updateOne({ _id: b._id, 'lines.id': lineId }, { $set: { 'lines.$.api.status': r.status, 'lines.$.api.note': r.note ?? '' } });
  await noteLine(b._id, `Ticket issued with ${l.api.provider}: ${l.api.offer.title}${l.api.reference || r.reference ? `, PNR ${l.api.reference || r.reference}` : ''}.`, by);
  await logActivity('booking', bookingId, by, `Issued with ${l.api.provider}: ${r.note ?? r.providerRef}.`);
}

/* ---------- Booking notes from Rates desk services ---------- */
const hhmm = (t: string) => `${t.slice(8, 10)}/${t.slice(5, 7)} ${t.slice(11, 16)}`;
const dmin = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

/**
 * Everything known about a service from its provider, written out for staff: itinerary segment by segment,
 * layovers, baggage, fare conditions, deadlines, provider and offer reference, cost and price.
 * Goes into the booking's internal notes, never the customer's.
 */
export function serviceNotes(l: { desc: string; cost: number; markup: number; markupType?: MarkupType; api?: ApiRef }) {
  const a = l.api;
  if (!a) return '';
  const o = a.offer;
  const price = r2(markupPrice(l.cost, l.markup, l.markupType));
  const out: string[] = [`■ ${o.title}`];
  if (o.flight) {
    o.flight.slices.forEach((s, i) => {
      out.push(`  ${o.flight!.slices.length > 1 ? (i === 0 ? 'Outbound' : 'Return') : 'Flight'}: ${s.origin} → ${s.destination}, ${dmin(s.durationMin)}, ${s.stops ? `${s.stops} stop${s.stops > 1 ? 's' : ''}` : 'direct'}${s.fareBrand ? `, fare ${s.fareBrand}` : ''}`);
      (s.segments ?? []).forEach((g, j) => {
        out.push(`    ${g.flight}  ${g.from} ${hhmm(g.departAt)} → ${g.to} ${hhmm(g.arriveAt)}${g.cabin ? `, ${g.cabin}` : ''}${g.aircraft ? `, ${g.aircraft}` : ''}`);
        const next = s.segments![j + 1];
        if (next) out.push(`      Connection in ${g.to}: ${dmin(Math.round((Date.parse(`${next.departAt}Z`) - Date.parse(`${g.arriveAt}Z`)) / 60000))}`);
      });
    });
    out.push(`  Baggage: ${o.flight.checkedBags ? `${o.flight.checkedBags} checked bag${o.flight.checkedBags > 1 ? 's' : ''} per passenger` : 'cabin bag only'}${o.flight.emissionsKg ? `; about ${Math.round(o.flight.emissionsKg)} kg CO₂` : ''}`);
  } else {
    for (const x of o.lines) out.push(`  ${x}`);
  }
  for (const c of o.conditions ?? []) out.push(`  ${c}`);
  out.push(`  ${o.refundable ? 'Refundable' : 'Non-refundable'}${o.cancelDeadline ? `; free cancellation until ${ddmmyyyy(o.cancelDeadline)}` : ''}${a.timeLimit ? `; ${o.kind === 'flight' ? 'ticket' : 'confirm'} by ${ddmmyyyy(a.timeLimit)}` : ''}`);
  out.push(`  Provider: ${a.provider}, offer ${o.id}`);
  out.push(`  Cost ${a.currency !== 'USD' ? `${a.currency} ${a.amount.toFixed(2)} = ` : ''}USD ${l.cost.toFixed(2)}; markup ${l.markupType === 'amount' ? `USD ${l.markup}` : `${l.markup}%`}; selling price USD ${price.toFixed(2)} before VAT`);
  return out.join('\n');
}
const markupPrice = (cost: number, markup: number, type?: MarkupType) => (type === 'amount' ? cost + markup : cost * (1 + markup / 100));

/** The notes block for services added from the Rates desk, dated and signed. */
export function ratesNotes(lines: Parameters<typeof serviceNotes>[0][], by: string, heading = 'From the Rates desk') {
  const blocks = lines.map(serviceNotes).filter(Boolean);
  if (!blocks.length) return '';
  return `${heading}, ${ddmmyyyy(new Date().toISOString().slice(0, 10))}, ${by}:\n${blocks.join('\n\n')}`;
}

/** A short fingerprint of the service itself (flights: flight numbers and departure times), to recognise it in a new search. */
function signature(o: Offer) {
  if (o.flight?.slices.every((s) => s.segments?.length)) return o.flight.slices.map((s) => s.segments!.map((g) => `${g.flight}@${g.departAt}`).join('+')).join('|');
  return `${o.kind}|${o.title}|${o.date}|${o.dateTo}|${o.lines.join('|')}`;
}
/** Repeats the original search and returns the same service, or null if it's no longer sold. */
async function findSame(c: Connector, api: ApiRef, by: string): Promise<Offer | null> {
  void by;
  if (!api.query) return null;
  const sig = signature(api.offer);
  const offers = await c.search(api.query);
  const same = offers.filter((o) => signature(o) === sig);
  // Several fares can share a flight: prefer the same refund conditions and baggage, then the cheapest.
  same.sort((a, b) => Number(b.refundable === api.offer.refundable) - Number(a.refundable === api.offer.refundable)
    || Number((b.flight?.checkedBags ?? 0) === (api.offer.flight?.checkedBags ?? 0)) - Number((a.flight?.checkedBags ?? 0) === (api.offer.flight?.checkedBags ?? 0))
    || a.amount - b.amount);
  return same[0] ?? null;
}
