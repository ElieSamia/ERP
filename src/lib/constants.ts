// Shared by the server and the browser. No server-only imports here.
export const CONTACT_TYPES = [
  ['customer', 'Individual'],
  ['agency', 'B2B agency'],
  ['corporate', 'Corporate'],
  ['supplier', 'Supplier'],
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number][0];

export const LEAD_STAGES = [
  ['new', 'New'],
  ['qualified', 'Qualified'],
  ['quoted', 'Quote sent'],
  ['won', 'Won'],
  ['lost', 'Lost'],
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number][0];

export const TYPE_BADGE: Record<string, string> = { customer: '', agency: 'b-accent', corporate: 'b-amber', supplier: '' };
export const STAGE_BADGE: Record<string, string> = { new: '', qualified: 'b-accent', quoted: 'b-amber', won: 'b-green', lost: 'b-red' };

export const label = (list: readonly (readonly [string, string])[], key: string) => list.find((x) => x[0] === key)?.[1] ?? key;
export const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
export const fmtDate = (d?: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set';
export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ---------- Bookings (phase 2) ---------- */
export const SERVICE_TYPES = [
  ['flight', 'Flight'], ['hotel', 'Hotel'], ['transfer', 'Transfer'], ['visa', 'Visa'],
  ['package', 'Package'], ['insurance', 'Insurance'], ['other', 'Other'],
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number][0];

export const TRIP_TYPES = [
  ['return', 'Return trip'],
  ['oneway', 'One way'],
  ['service', 'Service only, no travel (visa, insurance)'],
] as const;
export type TripType = (typeof TRIP_TYPES)[number][0];

export const BOOKING_STATES = [
  ['draft', 'Draft'], ['confirmed', 'Confirmed'], ['ticketed', 'Ticketed'], ['cancelled', 'Cancelled'],
] as const;
export type BookingStatus = (typeof BOOKING_STATES)[number][0];
export const BOOK_BADGE: Record<string, string> = { draft: '', confirmed: 'b-accent', ticketed: 'b-amber', cancelled: 'b-red' };

export const DOC_KINDS = [
  ['ticket', 'E-ticket'], ['voucher', 'Hotel voucher'], ['tvoucher', 'Transfer voucher'], ['avoucher', 'Tour or activity voucher'],
  ['evisa', 'E-visa'], ['visa', 'Visa'], ['insurance', 'Insurance policy'], ['itinerary', 'Itinerary'],
  ['passport', 'Passport'], ['id', 'ID card'], ['photo', 'Photo'], ['other', 'Other'],
] as const;

export type Channel = 'B2C' | 'B2B' | 'Corporate';
export const CHANNEL: Record<string, Channel> = { customer: 'B2C', agency: 'B2B', corporate: 'Corporate', supplier: 'B2C' };
export type Pricing = Record<Channel, number>;
export const DEFAULT_PRICING: Pricing = { B2C: 15, B2B: 8, Corporate: 10 };

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const sell = (l: { cost: number; markup: number }) => r2((Number(l.cost) || 0) * (1 + (Number(l.markup) || 0) / 100));
export function totals(lines: { cost: number; markup: number }[]) {
  const cost = r2(lines.reduce((s, l) => s + (Number(l.cost) || 0), 0));
  const total = r2(lines.reduce((s, l) => s + sell(l), 0));
  return { cost, total, margin: r2(total - cost) };
}
export const fmtRange = (a?: string, b?: string) => (a ? (b && b !== a ? `${fmtDate(a)} to ${fmtDate(b)}` : fmtDate(a)) : '');
export const travList = (s: string) => (s || '').split('\n').map((x) => x.trim()).filter(Boolean);
export const nights = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000)) : 0);

type Datable = { tripType: TripType; departDate: string; returnDate: string; lines: { date: string; dateTo: string }[] };
export function serviceDates(b: Datable) {
  const s = b.lines.map((l) => l.date).filter(Boolean).sort();
  const e = b.lines.map((l) => l.dateTo || l.date).filter(Boolean).sort();
  return s.length ? fmtRange(s[0], e[e.length - 1]) : '';
}
export function travelDates(b: Datable) {
  if (b.tripType === 'service') return serviceDates(b) || 'To be confirmed';
  if (b.tripType === 'oneway') return b.departDate ? `${fmtDate(b.departDate)}, one way` : 'To be confirmed';
  return fmtRange(b.departDate, b.returnDate) || 'To be confirmed';
}
