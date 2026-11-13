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
/** What portal customers see for each booking status: drafts are still being prepared by our team. */
export const PORTAL_STATUS: Record<string, [string, string]> = {
  draft: ['Being prepared', 'b-amber'], confirmed: ['Confirmed', 'b-accent'], ticketed: ['Ticketed', 'b-green'],
  invoiced: ['Invoiced', 'b-green'], cancelled: ['Cancelled', 'b-red'],
};
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
export type DocKind = 'confirm' | 'vouchers' | 'invoice' | 'receipt' | 'po' | 'voucher' | 'statement';
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

/* ---------- Customer portal (phase 5) ---------- */
export const REQ_STATES = [
  ['submitted', 'Submitted'], ['review', 'In review'], ['quoted', 'Quote sent'], ['approval', 'Waiting for approval'],
  ['accepted', 'Quote accepted'], ['booked', 'Booked'], ['declined', 'Declined'], ['cancelled', 'Cancelled'],
] as const;
export type RequestStatus = (typeof REQ_STATES)[number][0];
export const REQ_BADGE: Record<string, string> = { submitted: 'b-amber', review: 'b-accent', quoted: 'b-amber', approval: 'b-amber', accepted: 'b-green', booked: 'b-green', declined: 'b-red', cancelled: 'b-red' };
export const OPEN_REQ: RequestStatus[] = ['submitted', 'review', 'quoted', 'approval', 'accepted'];
/** Where a portal request sits in the CRM pipeline. */
export const REQ_TO_STAGE: Record<RequestStatus, LeadStage> = { submitted: 'new', review: 'qualified', quoted: 'quoted', approval: 'quoted', accepted: 'won', booked: 'won', declined: 'lost', cancelled: 'lost' };
export const TRAVEL_DOC_KINDS = ['ticket', 'voucher', 'tvoucher', 'avoucher', 'evisa', 'visa', 'insurance', 'itinerary'];

export type Perms = {
  requests: 'none' | 'view' | 'create'; scope: 'account' | 'own'; acceptQuotes: 'yes' | 'no'; approvalLimit: number; approveQuotes: 'yes' | 'no';
  bookings: 'none' | 'travelling' | 'view'; prices: 'yes' | 'no'; documents: 'none' | 'view' | 'upload'; invoices: 'yes' | 'no'; statement: 'yes' | 'no'; manageUsers: 'yes' | 'no';
};
export type PortalRole = { id: string; name: string; desc: string; builtin: boolean; perms: Perms };
const YN = [['yes', 'Yes'], ['no', 'No']] as const;
export const PERM_DEFS: [keyof Perms, string, readonly (readonly [string, string])[] | 'number'][] = [
  ['requests', 'Requests', [['none', 'No access'], ['view', 'View only'], ['create', 'Create and follow up']]],
  ['scope', 'Which requests and bookings', [['account', 'Everything for the account'], ['own', 'Only the ones they created']]],
  ['acceptQuotes', 'Accept quotes', YN],
  ['approvalLimit', 'Accept without approval up to (USD, 0 for no limit)', 'number'],
  ['approveQuotes', 'Approve quotes above colleagues’ limits', YN],
  ['bookings', 'Bookings', [['none', 'No access'], ['travelling', 'Only trips they travel on'], ['view', 'All bookings they can see']]],
  ['prices', 'See prices', YN],
  ['documents', 'Passports and other personal documents', [['none', 'No access'], ['view', 'View and download'], ['upload', 'View, download and upload']]],
  ['invoices', 'Invoices and receipts', YN],
  ['statement', 'Statement of account', YN],
  ['manageUsers', 'Manage their colleagues', YN],
];
export const BUILTIN_ROLES: PortalRole[] = [
  { id: 'admin', name: 'Account admin', builtin: true, desc: 'Owner or manager. Sees and does everything for the account, approves quotes and manages colleagues.',
    perms: { requests: 'create', scope: 'account', acceptQuotes: 'yes', approvalLimit: 0, approveQuotes: 'yes', bookings: 'view', prices: 'yes', documents: 'upload', invoices: 'yes', statement: 'yes', manageUsers: 'yes' } },
  { id: 'booker', name: 'Booker', builtin: true, desc: 'Sales staff. Sends requests and follows them up. Quotes above $2,000 need approval.',
    perms: { requests: 'create', scope: 'account', acceptQuotes: 'yes', approvalLimit: 2000, approveQuotes: 'no', bookings: 'view', prices: 'yes', documents: 'upload', invoices: 'no', statement: 'no', manageUsers: 'no' } },
  { id: 'finance', name: 'Finance', builtin: true, desc: 'Accountant. Invoices, receipts and the statement only.',
    perms: { requests: 'none', scope: 'account', acceptQuotes: 'no', approvalLimit: 0, approveQuotes: 'no', bookings: 'none', prices: 'yes', documents: 'none', invoices: 'yes', statement: 'yes', manageUsers: 'no' } },
  { id: 'viewer', name: 'Viewer', builtin: true, desc: 'Operations staff or coordinators. Follows requests and bookings and downloads documents, without prices.',
    perms: { requests: 'view', scope: 'account', acceptQuotes: 'no', approvalLimit: 0, approveQuotes: 'no', bookings: 'view', prices: 'no', documents: 'view', invoices: 'no', statement: 'no', manageUsers: 'no' } },
  { id: 'traveller', name: 'Traveller', builtin: true, desc: 'An employee of a corporate client. Only their own trips and travel documents.',
    perms: { requests: 'none', scope: 'own', acceptQuotes: 'no', approvalLimit: 0, approveQuotes: 'no', bookings: 'travelling', prices: 'no', documents: 'view', invoices: 'no', statement: 'no', manageUsers: 'no' } },
];
export function roleSummary(p: Perms): string[] {
  const n: string[] = [];
  if (p.requests !== 'none') n.push(p.requests === 'create' ? 'Sends requests and messages your team.' : 'Follows requests without changing them.');
  if (p.acceptQuotes === 'yes') n.push(p.approveQuotes === 'yes' ? 'Accepts any quote and approves colleagues’ quotes.' : +p.approvalLimit > 0 ? `Accepts quotes up to ${money(p.approvalLimit)}; above that an approver must approve.` : 'Accepts quotes of any amount.');
  if (p.scope === 'own' && p.requests !== 'none') n.push('Sees only requests they created and the bookings from them.');
  if (p.bookings === 'travelling') n.push('Sees only trips where they are a traveller.');
  if (p.bookings !== 'none') n.push('Downloads the tickets, vouchers and e-visas on bookings they can see.');
  if (p.documents === 'none' && p.bookings !== 'none') n.push('Can’t see passports or other personal documents.');
  if (p.prices === 'no') n.push('Prices are hidden, and confirmations print without them.');
  if (p.invoices === 'yes') n.push('Sees invoices and receipts.');
  if (p.statement === 'yes') n.push('Sees the statement of account.');
  if (p.manageUsers === 'yes') n.push('Invites and manages colleagues.');
  return n;
}
export type PortalSettings = { welcome: string; payInstructions: string; uploads: 'yes' | 'no'; autoBook: 'yes' | 'no'; quoteDays: number; response: string };
export const DEFAULT_PORTAL: PortalSettings = {
  welcome: 'Send us your requests and follow them here, together with your bookings, invoices and statement.',
  payInstructions: 'Pay by bank transfer to our USD account. Use the invoice number as the payment reference.',
  uploads: 'yes', autoBook: 'yes', quoteDays: 7, response: 'within one working day',
};
