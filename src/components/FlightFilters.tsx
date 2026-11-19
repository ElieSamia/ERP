'use client';
import { useMemo, useState } from 'react';
import { money } from '@/lib/constants';
import type { Result } from '@/lib/rates';
import { BANDS, flightMeta, freshFilters, passes, sortFlights, totalMin, type Filters, type Sort } from '@/lib/flightfilter';

/**
 * Filters and sorting for flight results, like the big travel sites: stops, baggage, departure and arrival
 * times, journey duration, layover time, airlines, connecting airports, conditions, price and emissions.
 * Everything runs in the browser on the results already found, so changing a filter is instant.
 */
export type { Sort };
export const dur = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

export function useFlightFilters(results: Result[], price: (r: Result) => number) {
  const flights = useMemo(() => results.filter((r) => r.flight), [results]);
  const meta = useMemo(() => flightMeta(flights, price), [flights, price]);
  const [f, setF] = useState<Filters>(() => freshFilters(meta));
  const [sort, setSort] = useState<Sort>('best');
  const [key, setKey] = useState('');
  // New results reset the filters to their full ranges.
  const sig = `${flights.length}:${meta.maxPrice}:${meta.maxDur}`;
  if (sig !== key) { setKey(sig); setF(freshFilters(meta)); }
  const filtered = flights.filter((r) => passes(r, f, price, meta.medianEm));
  const sorted = sortFlights(filtered, sort, price);
  const head = (s: Sort) => { const top = sortFlights(filtered, s, price).slice(0, 5); return top.length ? { price: price(top[0]), avg: Math.round(top.reduce((a, r) => a + totalMin(r), 0) / top.length) } : null; };
  return { f, setF, sort, setSort, sorted, all: flights.length, meta, heads: { best: head('best'), cheapest: head('cheapest'), fastest: head('fastest') }, reset: () => setF(freshFilters(meta)) };
}

type Hook = ReturnType<typeof useFlightFilters>;
const toggle = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };

export function SortTabs({ h }: { h: Hook }) {
  return (
    <div className="sorttabs" role="tablist" aria-label="Sort flights">
      {(['best', 'cheapest', 'fastest'] as Sort[]).map((s) => { const x = h.heads[s]; return (
        <button key={s} role="tab" aria-selected={h.sort === s} className={h.sort === s ? 'on' : ''} onClick={() => h.setSort(s)}>
          <span>{s === 'best' ? 'Best' : s === 'cheapest' ? 'Cheapest' : 'Fastest'}</span>
          <b>{x ? money(x.price) : '–'}</b><small>{x ? `${dur(x.avg)} average` : ''}</small>
        </button>); })}
    </div>
  );
}

export function FlightFilterPanel({ h }: { h: Hook }) {
  const { f, setF, meta } = h;
  const sec = (title: string, body: React.ReactNode, open = false) => <details className="ff" open={open}><summary>{title}</summary><div className="ff-body">{body}</div></details>;
  const box = (checked: boolean, on: () => void, label: React.ReactNode, right?: string) => <label className="ff-row"><input type="checkbox" checked={checked} onChange={on} /><span>{label}</span>{right && <small>{right}</small>}</label>;
  const bands = (k: 'out' | 'back' | 'arrOut') => BANDS.map(([b, l]) => <span key={b}>{box(f[k].has(b), () => setF({ ...f, [k]: toggle(f[k], b) }), l)}</span>);
  return (
    <aside className="fpanel" aria-label="Filter flights">
      <div className="cp" style={{ marginBottom: 6 }}><b>Filters</b><button className="linkbtn" onClick={h.reset}>Reset all</button></div>
      {sec('Stops', [[0, 'Direct'], [1, '1 stop'], [2, '2+ stops']].filter(([k]) => meta.stops.has(k as number)).map(([k, l]) => <span key={k}>{box(f.stops.has(k as number), () => setF({ ...f, stops: toggle(f.stops, k as number) }), l, money(meta.stops.get(k as number)!))}</span>), true)}
      {sec('Baggage', box(f.bags, () => setF({ ...f, bags: !f.bags }), 'Checked bag included'))}
      {sec('Departure times', <><p className="ff-sub">Outbound departure</p>{bands('out')}<p className="ff-sub">Outbound arrival</p>{bands('arrOut')}{meta.hasReturn && <><p className="ff-sub">Return departure</p>{bands('back')}</>}</>)}
      {sec('Journey duration', <label className="ff-range">Up to <b>{dur(f.maxDur)}</b> each way<input type="range" min={60} max={meta.maxDur || 60} step={15} value={f.maxDur} onChange={(e) => setF({ ...f, maxDur: Number(e.target.value) })} /></label>)}
      {meta.maxLay > 0 && sec('Layovers', <label className="ff-range">Longest connection up to <b>{dur(f.maxLay)}</b><input type="range" min={30} max={meta.maxLay} step={15} value={f.maxLay} onChange={(e) => setF({ ...f, maxLay: Number(e.target.value) })} /></label>)}
      {sec('Airlines', <>{[...meta.airlines.entries()].sort((a, b) => a[1] - b[1]).map(([a, p]) => <span key={a}>{box(f.airlines.has(a), () => setF({ ...f, airlines: toggle(f.airlines, a) }), a, money(p))}</span>)}
        {f.airlines.size > 0 && <button className="linkbtn" onClick={() => setF({ ...f, airlines: new Set() })}>Show all airlines</button>}</>, true)}
      {meta.via.size > 0 && sec('Connecting airports', <>{[...meta.via.entries()].sort().map(([v, p]) => <span key={v}>{box(f.via.has(v), () => setF({ ...f, via: toggle(f.via, v) }), v, money(p))}</span>)}<p className="ff-sub">Ticked airports only; direct flights stay.</p></>)}
      {sec('Conditions', <>{box(f.refundable, () => setF({ ...f, refundable: !f.refundable }), 'Refundable only')}{box(f.holdable, () => setF({ ...f, holdable: !f.holdable }), 'Can be held (pay later)')}</>)}
      {sec('Price', <label className="ff-range">Up to <b>{money(f.maxPrice)}</b><input type="range" min={0} max={meta.maxPrice || 1} step={1} value={f.maxPrice} onChange={(e) => setF({ ...f, maxPrice: Number(e.target.value) })} /></label>)}
      {meta.medianEm > 0 && sec('Flight emissions', box(f.lowEmissions, () => setF({ ...f, lowEmissions: !f.lowEmissions }), 'Only flights with lower CO₂ than average'))}
    </aside>
  );
}
