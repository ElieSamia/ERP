import type { Result } from './rates';

/** The flight filter and sort rules, kept apart from the screen so they can be tested on their own. */
export type Sort = 'best' | 'cheapest' | 'fastest';
export type Filters = {
  stops: Set<number>; bags: boolean; out: Set<string>; back: Set<string>; arrOut: Set<string>; maxDur: number; maxLay: number;
  airlines: Set<string>; via: Set<string>; refundable: boolean; holdable: boolean; maxPrice: number; lowEmissions: boolean;
};
export const BANDS: [string, string, number, number][] = [['night', 'Night (0–6)', 0, 6], ['morning', 'Morning (6–12)', 6, 12], ['afternoon', 'Afternoon (12–18)', 12, 18], ['evening', 'Evening (18–24)', 18, 24]];
const hour = (t: string) => Number(t.slice(11, 13));
export const band = (t: string) => BANDS.find(([, , a, b]) => hour(t) >= a && hour(t) < b)?.[0] ?? 'night';
export const totalMin = (r: Result) => (r.flight?.slices ?? []).reduce((s, x) => s + x.durationMin, 0);

export function flightMeta(flights: Result[], price: (r: Result) => number) {
  const airlines = new Map<string, number>(), via = new Map<string, number>(), stops = new Map<number, number>();
  let maxDur = 0, maxLay = 0, maxPrice = 0;
  const em: number[] = [];
  for (const r of flights) {
    const p = price(r), f = r.flight!;
    airlines.set(f.airline, Math.min(airlines.get(f.airline) ?? Infinity, p));
    const st = Math.min(Math.max(...f.slices.map((s) => s.stops)), 2);
    stops.set(st, Math.min(stops.get(st) ?? Infinity, p));
    for (const s of f.slices) for (const v of s.via) via.set(v, Math.min(via.get(v) ?? Infinity, p));
    maxDur = Math.max(maxDur, ...f.slices.map((s) => s.durationMin));
    maxLay = Math.max(maxLay, ...f.slices.map((s) => s.longestLayoverMin));
    maxPrice = Math.max(maxPrice, p);
    if (f.emissionsKg) em.push(f.emissionsKg);
  }
  em.sort((a, b) => a - b);
  return { airlines, via, stops, maxDur, maxLay, maxPrice: Math.ceil(maxPrice), medianEm: em.length ? em[Math.floor(em.length / 2)] : 0, hasReturn: flights.some((r) => (r.flight?.slices.length ?? 0) > 1) };
}
export type Meta = ReturnType<typeof flightMeta>;
export const freshFilters = (m: Meta): Filters => ({ stops: new Set(), bags: false, out: new Set(), back: new Set(), arrOut: new Set(), maxDur: m.maxDur, maxLay: m.maxLay, airlines: new Set(), via: new Set(), refundable: false, holdable: false, maxPrice: m.maxPrice, lowEmissions: false });

export function passes(r: Result, f: Filters, price: (r: Result) => number, medianEm: number) {
  const x = r.flight!, p = price(r), s0 = x.slices[0], s1 = x.slices[1];
  const st = Math.min(Math.max(...x.slices.map((s) => s.stops)), 2);
  return (!f.stops.size || f.stops.has(st)) && (!f.bags || x.checkedBags > 0)
    && (!f.out.size || f.out.has(band(s0.departAt))) && (!f.arrOut.size || f.arrOut.has(band(s0.arriveAt)))
    && (!f.back.size || !s1 || f.back.has(band(s1.departAt)))
    && x.slices.every((s) => s.durationMin <= f.maxDur && s.longestLayoverMin <= f.maxLay)
    && (!f.airlines.size || f.airlines.has(x.airline)) && (!f.via.size || x.slices.every((s) => s.via.every((v) => f.via.has(v))))
    && (!f.refundable || r.refundable) && (!f.holdable || !!r.timeLimit) && p <= f.maxPrice + 0.001
    && (!f.lowEmissions || !x.emissionsKg || x.emissionsKg <= medianEm);
}

/** Sorts results; Best weighs price 60% and total travel time 40%, like the large travel sites. */
export function sortFlights(list: Result[], sort: Sort, price: (r: Result) => number) {
  const ps = list.map(price), ds = list.map(totalMin);
  const minP = Math.min(...ps), maxP = Math.max(...ps), minD = Math.min(...ds), maxD = Math.max(...ds);
  const score = (r: Result) => 0.6 * ((price(r) - minP) / ((maxP - minP) || 1)) + 0.4 * ((totalMin(r) - minD) / ((maxD - minD) || 1));
  const cmp: Record<Sort, (a: Result, b: Result) => number> = {
    best: (a, b) => score(a) - score(b), cheapest: (a, b) => price(a) - price(b) || totalMin(a) - totalMin(b), fastest: (a, b) => totalMin(a) - totalMin(b) || price(a) - price(b),
  };
  return [...list].sort(cmp[sort]);
}
