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
  ['draft', 'Draft'], ['confirmed', 'Confirmed'], ['ticketed', 'Ticketed'], ['invoiced', 'Invoiced'], ['cancelled', 'Cancelled'],
] as const;
export type BookingStatus = (typeof BOOKING_STATES)[number][0];
export const BOOK_BADGE: Record<string, string> = { draft: '', confirmed: 'b-accent', ticketed: 'b-amber', invoiced: 'b-green', cancelled: 'b-red' };

export const DOC_KINDS = [
  ['ticket', 'E-ticket'], ['voucher', 'Hotel voucher'], ['tvoucher', 'Transfer voucher'], ['avoucher', 'Tour or activity voucher'],
  ['evisa', 'E-visa'], ['visa', 'Visa'], ['insurance', 'Insurance policy'], ['itinerary', 'Itinerary'],
  ['passport', 'Passport'], ['id', 'ID card'], ['photo', 'Photo'],
  ['bill', 'Supplier bill or invoice'], ['quote', 'Supplier quote or confirmation'], ['receipt', 'Receipt'], ['other', 'Other'],
] as const;

export type Channel = 'B2C' | 'B2B' | 'Corporate';
export const CHANNEL: Record<string, Channel> = { customer: 'B2C', agency: 'B2B', corporate: 'Corporate', supplier: 'B2C' };
export type MarkupType = 'percent' | 'amount';
export const MARKUP_TYPES = [['percent', '%'], ['amount', 'USD']] as const;
/** Default markup per channel: a percentage of the cost, or a fixed amount in USD added to each service. */
export type Pricing = Record<Channel, number> & { modes: Record<Channel, MarkupType> };
export const DEFAULT_PRICING: Pricing = { B2C: 15, B2B: 8, Corporate: 10, modes: { B2C: 'percent', B2B: 'percent', Corporate: 'percent' } };
export const fmtMarkup = (m: number, t?: MarkupType) => (t === 'amount' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(m || 0) : `${m || 0}%`);

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
/** Selling price of a service: cost plus a percentage, or cost plus a fixed amount. */
export const sell = (l: { cost: number; markup: number; markupType?: MarkupType }) =>
  l.markupType === 'amount' ? r2((Number(l.cost) || 0) + (Number(l.markup) || 0)) : r2((Number(l.cost) || 0) * (1 + (Number(l.markup) || 0) / 100));
export function totals(lines: { cost: number; markup: number; markupType?: MarkupType }[]) {
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

/* ---------- Printable documents and share links ---------- */
export type DocKind = 'confirm' | 'vouchers' | 'invoice' | 'receipt' | 'po' | 'voucher';
export const SHARE_DAYS = 30;

/* ---------- Invoicing, purchasing and expenses (phase 3) ---------- */
export const INVOICE_STATES = [['draft', 'Draft'], ['posted', 'Posted'], ['paid', 'Paid']] as const;
export type InvoiceStatus = (typeof INVOICE_STATES)[number][0];
export const INV_BADGE: Record<string, string> = { draft: '', posted: 'b-amber', paid: 'b-green' };

export const PO_STATES = [['draft', 'Request for quotation'], ['confirmed', 'Purchase order'], ['billed', 'Billed'], ['paid', 'Paid'], ['cancelled', 'Cancelled']] as const;
export type PurchaseStatus = (typeof PO_STATES)[number][0];
export const PO_BADGE: Record<string, string> = { draft: '', confirmed: 'b-accent', billed: 'b-amber', paid: 'b-green', cancelled: 'b-red' };

export const EXP_STATES = [['draft', 'Draft'], ['posted', 'Posted']] as const;
export type ExpenseStatus = (typeof EXP_STATES)[number][0];

export const PAY_METHODS = [['transfer', 'Bank transfer'], ['cash', 'Cash'], ['card', 'Card'], ['cheque', 'Cheque'], ['wallet', 'Wallet transfer']] as const;
export const VAT_RATES = [['0', '0%'], ['11', '11%']] as const;
export const ACCOUNT_TYPES = [['bank', 'Bank account'], ['cash', 'Cash box'], ['wallet', 'E-wallet'], ['gateway', 'Card or payment gateway']] as const;

export type PayAccount = { id: string; name: string; type: 'bank' | 'cash' | 'wallet' | 'gateway' };
export type ExpenseCategory = { id: string; name: string };
export type Finance = {
  terms: { customer: number; agency: number; corporate: number };
  supplierTerms: number;
  vat: Record<ServiceType, number>;
  accounts: PayAccount[];
  categories: ExpenseCategory[];
  autoPO: 'yes' | 'no';
};
export const DEFAULT_FINANCE: Finance = {
  terms: { customer: 14, agency: 14, corporate: 30 },
  supplierTerms: 30,
  vat: { flight: 0, hotel: 11, transfer: 11, visa: 11, package: 11, insurance: 11, other: 11 },
  accounts: [{ id: 'BNK', name: 'Bank, USD account', type: 'bank' }, { id: 'CSH', name: 'Cash on hand', type: 'cash' }],
  categories: [
    { id: 'water', name: 'Water' }, { id: 'electricity', name: 'Electricity and generator' }, { id: 'fuel', name: 'Fuel' },
    { id: 'stationery', name: 'Stationery and office supplies' }, { id: 'internet', name: 'Telephone and internet' }, { id: 'rent', name: 'Rent' },
    { id: 'maintenance', name: 'Maintenance and repairs' }, { id: 'cleaning', name: 'Cleaning and hospitality' }, { id: 'bankfees', name: 'Bank charges' },
    { id: 'other', name: 'Other' },
  ],
  autoPO: 'yes',
};

/** Totals for invoices and purchase orders: VAT is rounded per line, the way it prints. */
export function docTotals(lines: { amount: number; vat: number }[], payments: { amount: number }[] = []) {
  const untaxed = r2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const vat = r2(lines.reduce((s, l) => s + r2((Number(l.amount) || 0) * (Number(l.vat) || 0) / 100), 0));
  const total = r2(untaxed + vat);
  const paid = r2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  return { untaxed, vat, total, paid, balance: r2(total - paid) };
}
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/* ---------- Accounting (phase 4) ---------- */
export type AccType = 'asset' | 'receivable' | 'bank' | 'cash' | 'liability' | 'payable' | 'tax' | 'equity' | 'income' | 'expense';
export const ACC_TYPES = [
  ['asset', 'Asset'], ['receivable', 'Receivable'], ['bank', 'Bank'], ['cash', 'Cash'], ['liability', 'Liability'],
  ['payable', 'Payable'], ['tax', 'Tax'], ['equity', 'Equity'], ['income', 'Income'], ['expense', 'Expense'],
] as const;
export const ACC_CLASSES: Record<string, string> = {
  '1': 'Class 1, capital accounts', '2': 'Class 2, fixed assets', '3': 'Class 3, inventories', '4': 'Class 4, third-party accounts',
  '5': 'Class 5, financial accounts', '6': 'Class 6, expenses', '7': 'Class 7, revenues',
};
export type LedgerAccount = { code: string; name: string; type: AccType };
export type Currency = { code: string; name: string; rate: number };
export type AccSettings = {
  rev: Record<ServiceType, string>; cost: Record<ServiceType, string>; expense: Record<string, string>; payment: Record<string, string>;
  receivable: string; payable: string; vatOut: string; vatIn: string; openingOffset: string; currencies: Currency[]; ratesUpdated: string;
};
export const DEFAULT_PAYMENT_LEDGER: Record<PayAccount['type'], string> = { bank: '5121', cash: '531', wallet: '5141', gateway: '515' };
export const DEFAULT_ACC: AccSettings = {
  rev: { flight: '7061', hotel: '7062', package: '7063', transfer: '7064', visa: '7064', insurance: '7064', other: '7064' },
  cost: { flight: '6041', hotel: '6042', package: '6043', transfer: '6044', visa: '6044', insurance: '6044', other: '6044' },
  expense: { water: '6061', electricity: '6062', fuel: '6063', stationery: '6064', internet: '626', rent: '613', maintenance: '615', cleaning: '628', bankfees: '627', other: '658' },
  payment: { BNK: '5121', CSH: '531' },
  receivable: '411', payable: '401', vatOut: '4427', vatIn: '4426', openingOffset: '121',
  currencies: [
    { code: 'USD', name: 'US dollar', rate: 1 }, { code: 'LBP', name: 'Lebanese pound', rate: 89500 }, { code: 'EUR', name: 'Euro', rate: 0.86 },
    { code: 'AED', name: 'UAE dirham', rate: 3.6725 }, { code: 'SAR', name: 'Saudi riyal', rate: 3.75 },
  ],
  ratesUpdated: '2026-11-01',
};
export const MOVE_STATES = [['draft', 'Draft'], ['posted', 'Posted']] as const;
export type MoveLine = { id: string; account: string; partnerId: string; label: string; debit: number; credit: number };
export type Move = {
  id: string; ref: string | null; journal: string; date: string; label: string; partnerId: string; status: 'draft' | 'posted';
  lines: MoveLine[]; auto: boolean; origin?: { model: string; id: string }; createdAt?: string;
};
export const AGE = [['nd', 'Not yet due'], ['a30', '1 to 30 days'], ['a60', '31 to 60 days'], ['a90', '61 to 90 days'], ['a90p', 'Over 90 days']] as const;
export function ageBucket(due: string, today: string) {
  const d = Math.floor((Date.parse(today) - Date.parse(due)) / 86400000);
  return d <= 0 ? 'nd' : d <= 30 ? 'a30' : d <= 60 ? 'a60' : d <= 90 ? 'a90' : 'a90p';
}
/** Periods for reports: a year, or one of its quarters (Lebanese VAT returns are quarterly). */
export function periodRange(p: string): [string, string] {
  const m = /^(\d{4})(?:-Q([1-4]))?$/.exec(p);
  const y = m ? m[1] : new Date().getFullYear().toString();
  if (!m || !m[2]) return [`${y}-01-01`, `${y}-12-31`];
  const q = Number(m[2]);
  const ends = ['03-31', '06-30', '09-30', '12-31'];
  return [`${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`, `${y}-${ends[q - 1]}`];
}
