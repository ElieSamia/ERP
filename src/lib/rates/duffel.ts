import type { Connector, FlightInfo, Offer, ProviderMeta, Query, Reservation, Traveller } from './types';

/**
 * Duffel flights (https://duffel.com/docs/api). Test tokens start with duffel_test_ and book only Duffel's
 * fictional test airlines, with nothing charged. Flow: offer request (search) → get offer (re-check price) →
 * order (hold, or instant with balance payment) → payment (issue a held order) → order cancellation.
 */
const API = () => process.env.DUFFEL_API_BASE || 'https://api.duffel.com';
type Json = Record<string, unknown>;

class DuffelError extends Error { constructor(message: string, public status: number, public code = '') { super(message); } }

async function call(token: string, path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  const res = await fetch(`${API()}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Duffel-Version': 'v2', Accept: 'application/json', 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify({ data: init.body }) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 30000),
  }).catch((e) => { throw new DuffelError(`Couldn’t reach Duffel: ${(e as Error).message}`, 0); });
  const json = (await res.json().catch(() => ({}))) as { data?: Json; errors?: { title?: string; message?: string; code?: string }[] };
  if (!res.ok) {
    const e = json.errors?.[0];
    const msg = res.status === 401 ? 'Duffel refused the access token. Check it under Connections.' : e?.message || e?.title || `HTTP ${res.status}`;
    throw new DuffelError(msg, res.status, e?.code ?? '');
  }
  return json.data as Json;
}

const time = (iso: string) => iso.slice(11, 16);
const day = (iso: string) => iso.slice(0, 10);
type Seg = { departing_at: string; arriving_at: string; origin: { iata_code: string }; destination: { iata_code: string }; marketing_carrier: { iata_code: string; name: string }; marketing_carrier_flight_number: string; aircraft?: { name?: string } | null; passengers?: { baggages?: { type: string; quantity: number }[]; cabin_class_marketing_name?: string }[] };
type Slice = { origin: { iata_code: string }; destination: { iata_code: string }; segments: Seg[]; duration?: string | null; fare_brand_name?: string | null };
type DOffer = {
  id: string; total_amount: string; total_currency: string; owner: { name: string; iata_code: string }; slices: Slice[]; expires_at?: string; total_emissions_kg?: string | null;
  passengers: { id: string; type?: string; age?: number }[];
  conditions?: { refund_before_departure?: Cond | null; change_before_departure?: Cond | null };
  payment_requirements?: { requires_instant_payment?: boolean; payment_required_by?: string | null; price_guarantee_expires_at?: string | null };
};

type Cond = { allowed?: boolean; penalty_amount?: string | null; penalty_currency?: string | null };
const condLine = (what: string, c?: Cond | null) => (!c ? `${what}: not stated by the airline` : !c.allowed ? `${what}: not allowed` : `${what}: allowed${c.penalty_amount && Number(c.penalty_amount) > 0 ? `, penalty ${c.penalty_currency ?? ''} ${c.penalty_amount}` : ', no penalty'}`);

/** ISO 8601 durations like PT4H30M or P1DT2H, in minutes. */
export const isoMinutes = (d?: string | null) => {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(d ?? '');
  return m ? (Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : 0;
};
/** Minutes between two local times; only a fallback, since local times ignore time zones. */
const gap = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b.slice(0, 16)}Z`) - Date.parse(`${a.slice(0, 16)}Z`)) / 60000));

/** Duffel's offer in the ERP's standard shape. */
export function toOffer(o: DOffer): Offer {
  const first = o.slices[0], last = o.slices[o.slices.length - 1];
  const lines = o.slices.map((s, i) => {
    const a = s.segments[0], z = s.segments[s.segments.length - 1];
    const stops = s.segments.length - 1;
    return `${i === 0 ? 'Out' : 'Back'}: ${a.marketing_carrier.iata_code}${a.marketing_carrier_flight_number} ${s.origin.iata_code} ${day(a.departing_at)} ${time(a.departing_at)} → ${s.destination.iata_code} ${time(z.arriving_at)}, ${stops ? `${stops} stop${stops > 1 ? 's' : ''} (${s.segments.slice(0, -1).map((x) => x.destination.iata_code).join(', ')})` : 'direct'}`;
  });
  const bags = first.segments[0].passengers?.[0]?.baggages?.find((b) => b.type === 'checked')?.quantity ?? 0;
  lines.push(`${o.passengers.length} passenger${o.passengers.length === 1 ? '' : 's'}, ${bags ? `${bags} checked bag${bags > 1 ? 's' : ''} each` : 'no checked bag'}`);
  const refundable = !!o.conditions?.refund_before_departure?.allowed;
  const hold = o.payment_requirements && !o.payment_requirements.requires_instant_payment ? o.payment_requirements.payment_required_by : null;
  const flight: FlightInfo = {
    airline: o.owner.name, airlineCode: o.owner.iata_code, checkedBags: bags,
    emissionsKg: o.total_emissions_kg ? Number(o.total_emissions_kg) : undefined,
    slices: o.slices.map((s) => {
      const a = s.segments[0], z = s.segments[s.segments.length - 1];
      const lays = s.segments.slice(1).map((seg, i) => gap(s.segments[i].arriving_at, seg.departing_at));
      return {
        origin: s.origin.iata_code, destination: s.destination.iata_code, departAt: a.departing_at.slice(0, 16), arriveAt: z.arriving_at.slice(0, 16),
        durationMin: isoMinutes(s.duration) || gap(a.departing_at, z.arriving_at), stops: s.segments.length - 1,
        via: s.segments.slice(0, -1).map((x) => x.destination.iata_code), longestLayoverMin: lays.length ? Math.max(...lays) : 0,
        fareBrand: s.fare_brand_name ?? undefined,
        segments: s.segments.map((x) => ({ flight: `${x.marketing_carrier.iata_code}${x.marketing_carrier_flight_number}`, airline: x.marketing_carrier.name, from: x.origin.iata_code, to: x.destination.iata_code, departAt: x.departing_at.slice(0, 16), arriveAt: x.arriving_at.slice(0, 16), cabin: x.passengers?.[0]?.cabin_class_marketing_name, aircraft: x.aircraft?.name })),
      };
    }),
  };
  return {
    flight,
    conditions: [condLine('Refund before departure', o.conditions?.refund_before_departure), condLine('Changes before departure', o.conditions?.change_before_departure)],
    id: o.id, kind: 'flight', title: `${o.owner.name}, ${first.origin.iata_code} to ${first.destination.iata_code}${o.slices.length > 1 ? ' and back' : ''}`,
    lines, date: day(first.segments[0].departing_at), dateTo: o.slices.length > 1 ? day(last.segments[0].departing_at) : '',
    amount: Number(o.total_amount), currency: o.total_currency, refundable, timeLimit: hold ? day(hold) : undefined,
    tags: [o.slices.every((s) => s.segments.length === 1) ? 'Direct' : 'Connecting', refundable ? 'Refundable' : 'Non-refundable', hold ? 'Can be held' : 'Pay now'],
    extra: { passengers: o.passengers.map((p) => ({ id: p.id, type: p.type ?? (p.age !== undefined && p.age < 18 ? 'child' : 'adult') })), instant: !!o.payment_requirements?.requires_instant_payment },
  };
}

/** The details Duffel requires for each passenger; a clear message names whoever is missing what. */
function passengerData(offer: Offer, travellers: Traveller[]) {
  const slots = ((offer.extra?.passengers as { id: string; type: string }[]) ?? []);
  if (travellers.length < slots.length) throw new DuffelError(`This flight is for ${slots.length} passengers but the booking has ${travellers.length} travellers. Add the missing names.`, 400);
  return slots.map((p, i) => {
    const t = travellers[i];
    const missing = [!t.givenName && 'first name', !t.familyName && 'last name', !t.bornOn && 'date of birth', !t.gender && 'gender', !t.title && 'title', !t.email && 'email', !t.phone && 'phone'].filter(Boolean);
    if (missing.length) throw new DuffelError(`Add ${missing.join(', ')} for ${t.name} under Traveller details.`, 400);
    return {
      id: p.id, title: t.title, given_name: t.givenName, family_name: t.familyName, gender: t.gender, born_on: t.bornOn, email: t.email, phone_number: t.phone,
      ...(t.passport?.number ? { identity_documents: [{ type: 'passport', unique_identifier: t.passport.number, issuing_country_code: t.passport.country, expires_on: t.passport.expiry }] } : {}),
    };
  });
}

export const DUFFEL: ProviderMeta = {
  id: 'duffel', name: 'Duffel (flights)', kinds: ['flight'],
  description: 'Flights from hundreds of airlines through one API. In test mode, use a duffel_test_ token: search and book Duffel’s fictional test airline (Duffel Airways), nothing is charged.',
  fields: [{ key: 'token', label: 'Access token (Duffel dashboard → Developers → Access tokens)', secret: true, placeholder: 'duffel_test_…' }],
  create(creds, mode): Connector {
    const token = String(creds.token || '');
    const guard = () => {
      if (!token) throw new DuffelError('Add the Duffel access token under Connections.', 400);
      if (mode === 'test' && !token.startsWith('duffel_test_')) throw new DuffelError('This connection is in Test mode, so use a token starting with duffel_test_.', 400);
      if (mode === 'live' && !token.startsWith('duffel_live_')) throw new DuffelError('This connection is in Live mode, so use a token starting with duffel_live_.', 400);
    };
    return {
      async check() { guard(); await call(token, '/air/airlines?limit=1'); return `Duffel answered (${mode === 'test' ? 'test mode, nothing is charged' : 'live'}).`; },
      async search(query: Query) {
        guard();
        if (query.kind !== 'flight') return [];
        const q = query.q;
        const slices = [{ origin: q.origin, destination: q.destination, departure_date: q.depart }, ...(q.ret ? [{ origin: q.destination, destination: q.origin, departure_date: q.ret }] : [])];
        const passengers = [...Array(q.adults).fill({ type: 'adult' }), ...Array(q.children).fill({ age: 8 })];
        const r = await call(token, '/air/offer_requests?return_offers=true&supplier_timeout=20000', { method: 'POST', body: { slices, passengers, cabin_class: q.cabin, max_connections: 1 }, timeoutMs: 25000 });
        // Up to 200 offers; the Rates desk filters and pages through them.
        return ((r.offers as DOffer[]) ?? []).slice(0, 200).map(toOffer);
      },
      async recheck(o) {
        guard();
        try { const r = (await call(token, `/air/offers/${o.id}?return_available_services=false`)) as unknown as DOffer; return { amount: Number(r.total_amount), currency: r.total_currency }; }
        catch (e) { if (e instanceof DuffelError && [404, 410, 422].includes(e.status)) return null; throw e; }
      },
      async reserve(o, travellers): Promise<Reservation> {
        guard();
        const passengers = passengerData(o, travellers);
        const instant = !!o.extra?.instant;
        const order = await call(token, '/air/orders', { method: 'POST', body: {
          type: instant ? 'instant' : 'hold', selected_offers: [o.id], passengers,
          ...(instant ? { payments: [{ type: 'balance', currency: o.currency, amount: o.amount.toFixed(2) }] } : {}),
        } });
        const pr = order.payment_status as { awaiting_payment?: boolean; payment_required_by?: string | null } | undefined;
        const ref = String(order.booking_reference ?? '');
        if (pr?.awaiting_payment) return { providerRef: String(order.id), status: 'held', timeLimit: pr.payment_required_by ? day(pr.payment_required_by) : o.timeLimit, note: `PNR ${ref}, held until ${pr.payment_required_by ? pr.payment_required_by.replace('T', ' ').slice(0, 16) : 'the time limit'}; issue the ticket before then` };
        return { providerRef: String(order.id), status: 'confirmed', note: `PNR ${ref}, ticketed` };
      },
      async issue(orderId, o) {
        guard();
        const order = await call(token, `/air/orders/${orderId}`);
        await call(token, '/air/payments', { method: 'POST', body: { order_id: orderId, payment: { type: 'balance', currency: String(order.total_currency ?? o.currency), amount: String(order.total_amount ?? o.amount.toFixed(2)) } } });
        return { providerRef: orderId, status: 'confirmed', note: `PNR ${String(order.booking_reference ?? '')}, ticketed` };
      },
      async cancel(orderId, o) {
        guard();
        const c = await call(token, '/air/order_cancellations', { method: 'POST', body: { order_id: orderId } });
        await call(token, `/air/order_cancellations/${c.id}/actions/confirm`, { method: 'POST' });
        const refund = Number(c.refund_amount ?? 0);
        return { fee: Math.max(0, Math.round((o.amount - refund) * 100) / 100), currency: String(c.refund_currency ?? o.currency) };
      },
    };
  },
};
