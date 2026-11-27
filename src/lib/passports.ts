import type { Document, WithId } from 'mongodb';
import { paxFor } from './travellers';

/**
 * Passport checks for a booking: most countries want a passport valid at least six months after the trip ends.
 * "expired" = not valid on the travel dates, "short" = valid less than six months after the return,
 * "missing" = no passport details on a booking with flights.
 */
export type PassportIssue = { name: string; level: 'expired' | 'short' | 'missing'; expiry: string; text: string };
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const plusMonths = (iso: string, m: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };

export function passportIssues(b: WithId<Document>): PassportIssue[] {
  if (b.status === 'cancelled') return [];
  const lines = (b.lines as { type: string; date?: string; dateTo?: string }[]) || [];
  const dates = [b.departDate, b.returnDate, ...lines.flatMap((l) => [l.date, l.dateTo])].filter((x): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  if (!dates.length) return [];
  const start = dates[0], end = dates[dates.length - 1];
  const flights = lines.some((l) => l.type === 'flight' || l.type === 'package');
  const out: PassportIssue[] = [];
  for (const p of paxFor(b)) {
    if (!p.passportExpiry) {
      if (flights) out.push({ name: p.name, level: 'missing', expiry: '', text: `${p.name}: no passport details yet` });
      continue;
    }
    if (p.passportExpiry < end) out.push({ name: p.name, level: 'expired', expiry: p.passportExpiry, text: `${p.name}: passport expires ${dmy(p.passportExpiry)}, ${p.passportExpiry < start ? 'before departure' : 'during the trip'}` });
    else if (p.passportExpiry < plusMonths(end, 6)) out.push({ name: p.name, level: 'short', expiry: p.passportExpiry, text: `${p.name}: passport expires ${dmy(p.passportExpiry)}, less than six months after the return (${dmy(end)})` });
  }
  return out;
}
