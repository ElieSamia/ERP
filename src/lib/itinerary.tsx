import { promises as fs } from 'fs';
import path from 'path';
import type { FlightInfo } from './rates/types';

/**
 * The flight itinerary printed on the customer's booking confirmation: for each flight booked through the Rates
 * desk, its booking reference, every flight with times, connections and baggage. Never any price.
 */
type Raw = { id: string; type: string; api?: { status?: string; reference?: string; offer?: { flight?: FlightInfo; title?: string } } };
let names: Map<string, string> | null = null;
async function cityOf(code: string) {
  if (!names) {
    names = new Map();
    try {
      const list = JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'airports.json'), 'utf8')) as [string, string, string][];
      for (const a of list) names.set(a[0], (a[2] || a[1]).split(' (')[0]);
    } catch { /* the codes alone are fine */ }
  }
  return names.get(code) ?? '';
}
const dt = (s: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : '');
const day = (s: string) => (s ? new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '');
const dur = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
const gap = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));

export async function FlightItinerary({ lines }: { lines: Raw[] }) {
  const flights = lines.filter((l) => l.type === 'flight' && l.api?.offer?.flight && l.api.status !== 'cancelled');
  if (!flights.length) return null;
  const codes = new Set(flights.flatMap((l) => l.api!.offer!.flight!.slices.flatMap((s) => [s.origin, s.destination, ...(s.segments ?? []).flatMap((g) => [g.from, g.to])])));
  const city = new Map(await Promise.all([...codes].map(async (c) => [c, await cityOf(c)] as const)));
  const place = (c: string) => (city.get(c) ? `${city.get(c)} (${c})` : c);
  return (
    <>
      <h3>Flight itinerary</h3>
      {flights.map((l) => {
        const f = l.api!.offer!.flight!;
        return (
          <div key={l.id} className="itin">
            <p><b>{f.airline}</b>{l.api?.reference ? <> · Booking reference <b>{l.api.reference}</b></> : l.api?.status === 'quoted' ? ' · Not booked yet' : ''}</p>
            {f.slices.map((s, i) => (
              <div key={i}>
                <p className="itin-h">{f.slices.length > 1 ? (i === 0 ? 'Outbound' : i === f.slices.length - 1 ? 'Return' : `Flight ${i + 1}`) : 'Flight'}: {place(s.origin)} → {place(s.destination)}, {day(s.departAt)} · {dur(s.durationMin)}, {s.stops ? `${s.stops} stop${s.stops > 1 ? 's' : ''}` : 'direct'}{s.fareBrand ? ` · ${s.fareBrand}` : ''}</p>
                <table>
                  <thead><tr><th>Flight</th><th>From</th><th>Departs</th><th>To</th><th>Arrives</th><th>Cabin</th></tr></thead>
                  <tbody>{(s.segments?.length ? s.segments : [{ flight: '', airline: f.airline, from: s.origin, to: s.destination, departAt: s.departAt, arriveAt: s.arriveAt }]).flatMap((g, j, all) => [
                    <tr key={`s${j}`}><td><b>{g.flight || f.airlineCode}</b></td><td>{place(g.from)}</td><td>{dt(g.departAt)}</td><td>{place(g.to)}</td><td>{dt(g.arriveAt)}</td><td>{'cabin' in g && g.cabin ? g.cabin : ''}</td></tr>,
                    ...(all[j + 1] ? [<tr key={`c${j}`} className="itin-c"><td colSpan={6}>Connection in {place(g.to)}: {dur(gap(g.arriveAt, all[j + 1].departAt))}</td></tr>] : []),
                  ])}</tbody>
                </table>
              </div>
            ))}
            <p className="muted">Baggage: {f.checkedBags ? `${f.checkedBags} checked bag${f.checkedBags > 1 ? 's' : ''} per traveller` : 'hand baggage only; checked bags can be added for a fee'}. Times are local at each airport.</p>
          </div>
        );
      })}
    </>
  );
}
