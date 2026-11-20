import { createHash } from 'crypto';
import type { Connector, Offer, ProviderMeta, Query } from './types';

/**
 * A pretend provider with believable flights, hotels, transfers and insurance, so the whole Rates desk can be
 * used and tested before any real API is connected. Results depend only on the search, so the same search
 * gives the same results; about one offer in five changes price when re-checked, to exercise that path.
 */
const h = (s: string) => parseInt(createHash('sha1').update(s).digest('hex').slice(0, 7), 16); // 28 bits: safe for bit shifts
// Seeds can be above 2^31, where >> turns negative: always land on a valid index.
const pick = <T,>(arr: T[], seed: number) => arr[((Math.trunc(seed) % arr.length) + arr.length) % arr.length];
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const nights = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const AIRLINES = [['ME', 'Middle East Airlines'], ['EK', 'Emirates'], ['QR', 'Qatar Airways'], ['TK', 'Turkish Airlines'], ['PC', 'Pegasus Airlines'], ['RJ', 'Royal Jordanian']];
const HOTELS = ['Grand Palace', 'Marina Suites', 'Old Town Boutique', 'Airport Inn', 'Seaside Resort & Spa', 'City Centre Hotel'];
const BOARDS = [['RO', 'Room only'], ['BB', 'Bed and breakfast'], ['HB', 'Half board']];

function search(query: Query): Offer[] {
  if (query.kind === 'flight') {
    const q = query.q, pax = q.adults + q.children;
    return AIRLINES.map(([code, name], i) => {
      const s = h(`${q.origin}${q.destination}${q.depart}${q.ret}${code}`);
      const direct = s % 3 !== 0;
      const base = (q.cabin === 'business' ? 900 : 180) + (s % 260) + (q.ret ? 140 : 0);
      const dep = `${String(5 + (s % 15)).padStart(2, '0')}:${pick(['05', '20', '35', '50'], s)}`;
      const refundable = s % 4 === 0;
      // Structured details for the desk's filters: times, durations, stops, layovers, bags.
      const via = direct ? [] : [pick(['IST', 'DOH', 'AMM', 'CAI'], s)];
      const leg = (from: string, to: string, date: string, hh: number, mm: number) => {
        const dur = (direct ? 200 : 330) + (s % 90) + (direct ? 0 : (s >> 5) % 240);
        const dep = `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        const arr = new Date(Date.parse(`${dep}Z`) + dur * 60000).toISOString().slice(0, 16);
        const lay = direct ? 0 : 60 + ((s >> 7) % 300);
        const fn = `${code}${100 + (s % 800)}`;
        const mid = new Date(Date.parse(`${dep}Z`) + Math.round((dur - lay) / 2) * 60000).toISOString().slice(0, 16);
        const mid2 = new Date(Date.parse(`${mid}Z`) + lay * 60000).toISOString().slice(0, 16);
        const segments = direct ? [{ flight: fn, airline: name, from, to, departAt: dep, arriveAt: arr, cabin: q.cabin === 'business' ? 'Business' : 'Economy' }]
          : [{ flight: fn, airline: name, from, to: via[0], departAt: dep, arriveAt: mid, cabin: q.cabin === 'business' ? 'Business' : 'Economy' }, { flight: `${code}${900 - (s % 800)}`, airline: name, from: via[0], to, departAt: mid2, arriveAt: arr, cabin: q.cabin === 'business' ? 'Business' : 'Economy' }];
        return { origin: from, destination: to, departAt: dep, arriveAt: arr, durationMin: dur, stops: via.length, via, longestLayoverMin: lay, segments };
      };
      const mm = Number(pick(['05', '20', '35', '50'], s));
      const flight = {
        airline: name, airlineCode: code, checkedBags: pick([1, 1, 0], s >> 3), emissionsKg: 180 + (s % 140) * (direct ? 1 : 1.3),
        slices: [leg(q.origin, q.destination, q.depart, 5 + (s % 15), mm), ...(q.ret ? [leg(q.destination, q.origin, q.ret, 7 + ((s >> 4) % 14), mm)] : [])],
      };
      return {
        flight,
        conditions: [refundable ? 'Refund before departure: allowed, penalty USD 50.00' : 'Refund before departure: not allowed', 'Changes before departure: allowed, penalty USD 75.00'],
        id: `DF-${code}-${s.toString(36)}`, kind: 'flight', title: `${name}, ${q.origin} to ${q.destination}${q.ret ? ' and back' : ''}`,
        lines: [`${code}${100 + (s % 800)} departs ${q.depart} at ${dep}, ${direct ? 'direct' : `1 stop in ${pick(['IST', 'DOH', 'AMM', 'CAI'], s)}`}`,
          ...(q.ret ? [`Return ${q.ret}, ${direct ? 'direct' : '1 stop'}`] : []), `${pax} passenger${pax === 1 ? '' : 's'}, ${q.cabin}, ${pick(['23 kg', '30 kg', '20 kg'], s >> 3)} checked bag`],
        date: q.depart, dateTo: q.ret, amount: r2(base * q.adults + base * 0.75 * q.children), currency: 'USD', refundable,
        timeLimit: addDays(today(), 2 + (i % 2)), cancelDeadline: refundable ? addDays(q.depart, -2) : undefined,
        tags: [direct ? 'Direct' : '1 stop', refundable ? 'Refundable' : 'Non-refundable'],
      };
    });
  }
  if (query.kind === 'hotel') {
    const q = query.q, n = nights(q.checkIn, q.checkOut);
    return HOTELS.map((hotel, i) => {
      const s = h(`${q.destination}${q.checkIn}${q.checkOut}${hotel}`);
      const stars = 3 + (s % 3), [, board] = pick(BOARDS, s >> 2);
      const perNight = 55 + stars * 28 + (s % 70);
      const refundable = s % 3 !== 0;
      return {
        id: `DH-${i}-${s.toString(36)}`, kind: 'hotel', title: `${hotel}, ${q.destination}`,
        lines: [`${stars} stars, ${pick(['Standard room', 'Deluxe room', 'Superior room', 'Junior suite'], s >> 4)}, ${board}`, `${q.rooms} room${q.rooms === 1 ? '' : 's'}, ${n} night${n === 1 ? '' : 's'}, ${q.adults} adult${q.adults === 1 ? '' : 's'}${q.children ? `, ${q.children} children` : ''}`],
        date: q.checkIn, dateTo: q.checkOut, amount: r2(perNight * n * q.rooms), currency: pick(['USD', 'USD', 'EUR'], s >> 6), refundable,
        cancelDeadline: refundable ? addDays(q.checkIn, -3) : undefined, tags: [`${stars} stars`, board, refundable ? 'Free cancellation' : 'Non-refundable'],
      };
    });
  }
  if (query.kind === 'transfer') {
    const q = query.q;
    return [['Shared shuttle', 1, 18], ['Private sedan', 3, 45], ['Private minivan', 7, 70], ['Executive car', 3, 95]].filter(([, cap]) => (cap as number) >= Math.min(q.passengers, 7) || q.passengers > 7).map(([kind, cap, price], i) => {
      const s = h(`${q.from}${q.to}${q.date}${kind}`);
      const vehicles = kind === 'Shared shuttle' ? 1 : Math.ceil(q.passengers / (cap as number));
      return {
        id: `DT-${i}-${s.toString(36)}`, kind: 'transfer', title: `${kind}, ${q.from} to ${q.to}`,
        lines: [`${q.date} at ${q.time}, ${q.passengers} passenger${q.passengers === 1 ? '' : 's'}${vehicles > 1 ? `, ${vehicles} vehicles` : ''}`, 'Meet and greet with a name sign; 60 minutes free waiting'],
        date: q.date, dateTo: '', amount: r2((price as number) * (kind === 'Shared shuttle' ? q.passengers : vehicles) + (s % 15)), currency: 'USD', refundable: true,
        cancelDeadline: addDays(q.date, -1), tags: [kind === 'Shared shuttle' ? 'Shared' : 'Private', 'Free cancellation'],
      };
    });
  }
  const q = query.q, days = nights(q.start, q.end) + 1;
  return [['Essential', 0.9, '50,000'], ['Standard', 1.4, '150,000'], ['Premium', 2.3, '500,000']].map(([plan, rate, cover], i) => ({
    id: `DI-${i}-${h(`${q.destination}${q.start}${q.end}${plan}`).toString(36)}`, kind: 'insurance' as const, title: `Travel insurance ${plan}, ${q.destination}`,
    lines: [`Medical cover up to EUR ${cover}, ${days} days, ${q.travellers} traveller${q.travellers === 1 ? '' : 's'}`, 'Valid for Schengen visa applications'],
    date: q.start, dateTo: q.end, amount: r2(Math.max(12, (rate as number) * days) * q.travellers), currency: 'USD', refundable: true, cancelDeadline: addDays(q.start, -1),
    tags: [String(plan), 'Schengen'],
  }));
}

export const DEMO: ProviderMeta = {
  id: 'demo', name: 'Demo provider', kinds: ['flight', 'hotel', 'transfer', 'insurance'],
  description: 'Sample results for trying the Rates desk. Nothing is really booked.',
  fields: [],
  create(): Connector {
    return {
      async check() { return 'Demo provider: always available'; },
      async search(q) { await new Promise((r) => setTimeout(r, 150)); return search(q); },
      async recheck(o: Offer) { const s = h(o.id); return s % 5 === 0 ? { amount: r2(o.amount * 1.04), currency: o.currency } : { amount: o.amount, currency: o.currency }; },
      async reserve(o, _t, reference) {
        const code = h(`${o.id}${reference}`).toString(36).toUpperCase().padStart(6, 'X').slice(0, 6);
        return o.kind === 'flight' ? { providerRef: code, reference: code, status: 'held', timeLimit: o.timeLimit, note: `PNR ${code}, held until ${o.timeLimit ? `${o.timeLimit.slice(8, 10)}/${o.timeLimit.slice(5, 7)}/${o.timeLimit.slice(0, 4)}` : 'the time limit'}` } : { providerRef: `DEMO-${code}`, reference: `DEMO-${code}`, status: 'confirmed', note: `Confirmation DEMO-${code}` };
      },
      async issue(ref) { return { providerRef: ref, reference: ref, status: 'confirmed', note: `PNR ${ref}, ticketed` }; },
      async cancel(_ref, o) { const free = o.refundable && (!o.cancelDeadline || today() <= o.cancelDeadline); return { fee: free ? 0 : o.amount, currency: o.currency }; },
    };
  },
};
