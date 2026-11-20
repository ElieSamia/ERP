/**
 * Airport search for the Rates desk. Data: public/airports.json, built from OurAirports (public domain):
 * every airport with an IATA code and scheduled flights, plus multi-airport city codes like LON and PAR.
 * Each entry: [code, name, city, country, countryCode, size] where size -1 = city code, 0 large, 1 medium, 2 small.
 */
export type Airport = [string, string, string, string, string, number];

/** The busiest hubs come first when several airports match equally (Heathrow before Gatwick, DXB before DWC). */
const HUBS = new Set('ATL DXB DFW LHR HND ORD DEN IST LAX CDG AMS DEL JFK FRA MAD SIN ICN CAN PVG PEK BKK DOH CLT LAS MCO MIA SFO SEA EWR BCN FCO MUC HKG KUL CGK SYD YYZ MEX GRU JED RUH AUH CAI BEY AMM LCA ATH ZRH VIE CPH DUB LIS MXP MAN BOM BLR TPE NRT KIX MEL'.split(' '));

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/gi, ' ').toLowerCase().replace(/\s+/g, ' ').trim();

/** Best matches first: exact code, then city, then airport name, then country; bigger airports before smaller. */
export function searchAirports(list: Airport[], query: string, limit = 12): Airport[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(' ');
  const scored: [number, Airport][] = [];
  for (const a of list) {
    const code = a[0].toLowerCase(), name = norm(a[1]), city = norm(a[2]), country = norm(a[3]);
    const hay = `${code} ${name} ${city} ${country} ${a[4].toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const s = code === q ? 0
      : city === q || city.startsWith(`${q} `) || city.startsWith(q) ? 1
      : code.startsWith(q) ? 2
      : name.startsWith(q) ? 3
      : city.includes(q) || name.split(' ').some((w) => w.startsWith(q)) ? 4
      : country.startsWith(q) ? 5 : 6;
    // Lower is better: match quality first, then size, then name matching the search, then hubs.
    scored.push([s * 10 + a[5] + 1 + (name.includes(q) ? 0 : 0.5) - (HUBS.has(a[0]) ? 0.8 : 0), a]);
  }
  return scored.sort((x, y) => x[0] - y[0] || x[1][1].localeCompare(y[1][1])).slice(0, limit).map((x) => x[1]);
}

let cache: Promise<Airport[]> | null = null;
/** Loads the list once per page; the browser caches the file. */
export function loadAirports(): Promise<Airport[]> {
  if (!cache) cache = fetch('/airports.json').then((r) => { if (!r.ok) throw new Error('Couldn’t load the airport list.'); return r.json(); }).catch((e) => { cache = null; throw e; });
  return cache;
}
export const airportLabel = (a: Airport) => `${a[2] ? `${a[2].split(' (')[0]}, ` : ''}${a[3]}`;
