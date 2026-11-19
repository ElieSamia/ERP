import { randomBytes } from 'crypto';
import { ObjectId, type Document, type WithId } from 'mongodb';
import { db } from '../db';
import { decrypt, encrypt } from '../mail';
import { HttpError } from '../api';
import { getAccSettings, rateOf } from '../accounting';
import { logActivity } from '../activity';
import { r2, travList, type MarkupType } from '../constants';
import { providerMeta } from './registry';
import type { Connector, Offer, Query, RateKind } from './types';

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
  const logged = <K extends keyof Connector>(op: K) => (async (...args: Parameters<Connector[K]>) => {
    const t0 = Date.now();
    try {
      const r = await (inner[op] as (...a: unknown[]) => Promise<unknown>)(...args);
      await d.collection('ratelog').insertOne({ connectionId: conn.id, at: new Date(), op, ms: Date.now() - t0, ok: true, summary: summary(op, args, r) }).catch(() => null);
      return r;
    } catch (e) {
      const msg = (e as Error).message || 'The provider returned an error.';
      await d.collection('ratelog').insertOne({ connectionId: conn.id, at: new Date(), op, ms: Date.now() - t0, ok: false, error: msg.slice(0, 500), summary: summary(op, args) }).catch(() => null);
      throw new HttpError(502, `${conn.name}: ${msg}`);
    }
  }) as Connector[K];
  return { conn, raw, c: { search: logged('search'), recheck: logged('recheck'), reserve: logged('reserve'), cancel: logged('cancel'), check: logged('check') } };
}
function summary(op: string, args: unknown[], r?: unknown) {
  if (op === 'search') { const q = args[0] as Query; return `${q.kind} ${JSON.stringify(q.q)}${Array.isArray(r) ? ` → ${r.length} offers` : ''}`; }
  if (op === 'reserve' || op === 'recheck' || op === 'cancel') { const o = (op === 'cancel' ? args[1] : args[0]) as Offer; return `${o?.title ?? ''} (${o?.id ?? ''})${r ? ` → ${JSON.stringify(r).slice(0, 160)}` : ''}`; }
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
      for (const o of offers) {
        const token = randomBytes(12).toString('base64url');
        const costUSD = await toUSD(o.amount, o.currency);
        // Kept for 3 hours, so a result can be added to a quote or booking after the search.
        await d.collection('offers').insertOne({ _id: token as unknown as ObjectId, connectionId: conn.id, provider: conn.name, offer: o, costUSD, createdAt: new Date(), expiresAt: new Date(Date.now() + 3 * 3600e3) });
        out.push({ ...o, token, connectionId: conn.id, provider: conn.name, costUSD });
      }
    } catch (e) { errors.push({ provider: conn.name, error: (e as Error).message }); }
  }));
  return { results: out.sort((a, b) => a.costUSD - b.costUSD), errors };
}

/* ---------- From results to booking lines ---------- */
export type ApiRef = {
  connectionId: string; provider: string; offer: Offer; currency: string; amount: number;
  status: 'quoted' | 'held' | 'confirmed' | 'cancelled'; providerRef?: string; timeLimit?: string; deadline?: string; note?: string; fee?: number;
};
const TYPE: Record<RateKind, string> = { flight: 'flight', hotel: 'hotel', transfer: 'transfer', insurance: 'insurance' };

export async function offerLines(tokens: string[], markup: number, markupType: MarkupType) {
  const d = await db();
  const docs = await d.collection('offers').find({ _id: { $in: tokens as unknown as ObjectId[] } }).toArray();
  if (docs.length !== tokens.length) throw new HttpError(410, 'Some results have expired. Search again.');
  const conns = await listConnections();
  return docs.map((x) => {
    const o = x.offer as Offer, conn = conns.find((c) => c.id === x.connectionId);
    const api: ApiRef = { connectionId: String(x.connectionId), provider: String(x.provider), offer: o, currency: o.currency, amount: o.amount, status: 'quoted', deadline: o.cancelDeadline, timeLimit: o.timeLimit };
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
  const now = await c.recheck(l.api.offer);
  if (!now) throw new HttpError(409, `${l.api.provider} says this option is no longer available. Search again for alternatives.`);
  const newCost = await toUSD(now.amount, now.currency);
  if (Math.abs(newCost - l.cost) > 0.009 && acceptPrice !== newCost) {
    throw Object.assign(new HttpError(409, `The price changed from $${l.cost.toFixed(2)} to $${newCost.toFixed(2)}. Accept the new price to reserve.`), { extra: { newCost } });
  }
  const travellers = travList(String(b.travellers || '')).map((name) => ({ name }));
  if (!travellers.length) throw new HttpError(400, 'Add the travellers’ names to the booking first: the provider needs them.');
  const res = await c.reserve({ ...l.api.offer, amount: now.amount, currency: now.currency }, travellers, String(b.ref));
  const api: ApiRef = { ...l.api, status: res.status, providerRef: res.providerRef, timeLimit: res.timeLimit ?? l.api.timeLimit, note: res.note, amount: now.amount, currency: now.currency };
  await d.collection('bookings').updateOne({ _id: b._id, 'lines.id': lineId }, { $set: { 'lines.$.api': api, 'lines.$.cost': newCost } });
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
  await logActivity('booking', bookingId, by, `Reservation ${l.api.providerRef} cancelled with ${l.api.provider}${fee ? `; cancellation fee $${fee.toFixed(2)}` : ', no fee'}.`);
  return { fee };
}
