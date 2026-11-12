import { randomUUID, createHash } from 'crypto';
import { ObjectId, type Document, type WithId } from 'mongodb';
import { db } from './db';
import { getFinance, nextNumber } from './finance';
import {
  DEFAULT_ACC, DEFAULT_PAYMENT_LEDGER, docTotals, r2, todayISO, addDays, ageBucket,
  type AccSettings, type AccType, type Finance, type LedgerAccount, type Move, type MoveLine,
} from './constants';

/* ---------- Chart of accounts: a starter set on the 7 classes of the Lebanese chart ---------- */
const CHART: [string, string, AccType][] = [
  ['101', 'Capital', 'equity'], ['111', 'Legal reserve', 'equity'], ['118', 'Other reserves', 'equity'],
  ['121', 'Retained earnings, profits brought forward', 'equity'], ['125', 'Retained earnings, losses brought forward', 'equity'],
  ['131', 'Net profit for the year', 'equity'], ['135', 'Net loss for the year', 'equity'], ['161', 'Bank loans, long term', 'liability'],
  ['211', 'Software and licences', 'asset'], ['221', 'Land', 'asset'], ['223', 'Buildings', 'asset'], ['226', 'Office equipment and furniture', 'asset'],
  ['227', 'IT equipment', 'asset'], ['228', 'Vehicles', 'asset'], ['282', 'Accumulated depreciation, tangible assets', 'asset'],
  ['370', 'Merchandise inventory', 'asset'],
  ['401', 'Suppliers', 'payable'], ['409', 'Suppliers, advances paid', 'asset'], ['411', 'Customers', 'receivable'], ['419', 'Customers, advances received', 'liability'],
  ['421', 'Personnel, salaries payable', 'liability'], ['431', 'National Social Security Fund (NSSF)', 'liability'], ['441', 'Income tax payable', 'tax'],
  ['4426', 'VAT recoverable', 'tax'], ['4427', 'VAT collected', 'tax'], ['455', 'Shareholders, current accounts', 'liability'], ['471', 'Suspense account', 'asset'],
  ['5121', 'Bank, USD account', 'bank'], ['5122', 'Bank, LBP account', 'bank'], ['5141', 'Mobile wallet', 'bank'], ['515', 'Card and payment gateways', 'bank'],
  ['531', 'Cash on hand', 'cash'], ['581', 'Internal transfers', 'asset'],
  ['6041', 'Air tickets purchased', 'expense'], ['6042', 'Hotel and accommodation purchased', 'expense'], ['6043', 'Packages and tours purchased', 'expense'],
  ['6044', 'Other travel services purchased', 'expense'], ['6061', 'Water', 'expense'], ['6062', 'Electricity and generator', 'expense'], ['6063', 'Fuel', 'expense'],
  ['6064', 'Stationery and office supplies', 'expense'], ['613', 'Rent', 'expense'], ['615', 'Maintenance and repairs', 'expense'], ['616', 'Insurance premiums', 'expense'],
  ['622', 'Professional fees', 'expense'], ['623', 'Advertising and marketing', 'expense'], ['626', 'Telephone and internet', 'expense'], ['627', 'Bank charges', 'expense'],
  ['628', 'Cleaning and hospitality', 'expense'], ['631', 'Taxes and duties', 'expense'], ['641', 'Salaries and wages', 'expense'], ['645', 'NSSF employer contributions', 'expense'],
  ['658', 'Other operating expenses', 'expense'], ['661', 'Interest expense', 'expense'], ['666', 'Foreign exchange losses', 'expense'], ['681', 'Depreciation expense', 'expense'],
  ['691', 'Income tax expense', 'expense'],
  ['7061', 'Air ticketing revenue', 'income'], ['7062', 'Hotel and accommodation revenue', 'income'], ['7063', 'Packages and tours revenue', 'income'],
  ['7064', 'Other travel services revenue', 'income'], ['708', 'Commissions received', 'income'], ['766', 'Foreign exchange gains', 'income'], ['771', 'Other income', 'income'],
];

export async function getChart(): Promise<LedgerAccount[]> {
  const col = (await db()).collection<{ _id: string } & LedgerAccount>('accounts');
  if ((await col.countDocuments({}, { limit: 1 })) === 0) {
    await col.insertMany(CHART.map(([code, name, type]) => ({ _id: code, code, name, type }))).catch(() => null);
  }
  const list = await col.find({}).toArray();
  return list.map((a) => ({ code: a.code, name: a.name, type: a.type })).sort((a, b) => a.code.localeCompare(b.code));
}

export async function getAccSettings(): Promise<AccSettings> {
  const d = await (await db()).collection<{ _id: string } & Partial<AccSettings>>('settings').findOne({ _id: 'accounting' });
  return {
    rev: { ...DEFAULT_ACC.rev, ...(d?.rev || {}) }, cost: { ...DEFAULT_ACC.cost, ...(d?.cost || {}) },
    expense: { ...DEFAULT_ACC.expense, ...(d?.expense || {}) }, payment: { ...DEFAULT_ACC.payment, ...(d?.payment || {}) },
    receivable: d?.receivable ?? DEFAULT_ACC.receivable, payable: d?.payable ?? DEFAULT_ACC.payable, vatOut: d?.vatOut ?? DEFAULT_ACC.vatOut,
    vatIn: d?.vatIn ?? DEFAULT_ACC.vatIn, openingOffset: d?.openingOffset ?? DEFAULT_ACC.openingOffset,
    currencies: d?.currencies?.length ? d.currencies : DEFAULT_ACC.currencies, ratesUpdated: d?.ratesUpdated ?? DEFAULT_ACC.ratesUpdated,
  };
}
export const rateOf = (acc: AccSettings, code: string) => acc.currencies.find((c) => c.code === code)?.rate ?? 1;

export function journals(fin: Finance) {
  return [
    { code: 'VEN', name: 'Customer invoices' }, { code: 'ACH', name: 'Supplier bills and expenses' },
    ...fin.accounts.map((a) => ({ code: a.id, name: a.name })), { code: 'OD', name: 'Miscellaneous operations' },
  ];
}
export function paymentLedger(fin: Finance, acc: AccSettings, accountId: string) {
  return acc.payment[accountId] ?? DEFAULT_PAYMENT_LEDGER[fin.accounts.find((a) => a.id === accountId)?.type ?? 'bank'];
}

/* ---------- Automatic journal entries ---------- */
type Spec = { journal: string; date: string; label: string; partnerId: string; origin: { model: string; id: string }; lines: Omit<MoveLine, 'id'>[] };
const L = (account: string, debit: number, credit: number, label: string, partnerId = ''): Omit<MoveLine, 'id'> => ({ account, partnerId, label, debit: r2(debit), credit: r2(credit) });
const hashOf = (s: Spec) => createHash('sha1').update(JSON.stringify(s)).digest('hex');

async function moveRef(journal: string, date: string) {
  const y = date.slice(0, 4);
  return `${journal}/${y}/${String(await nextNumber(`move-${journal}-${y}`)).padStart(4, '0')}`;
}

/**
 * Brings the books in line with the documents: every posted invoice, payment, supplier bill and posted expense
 * has exactly one journal entry. Missing entries are created, changed documents are re-posted, and entries whose
 * document went back to draft are removed. Safe to run any number of times.
 */
export async function syncAccounting() {
  const d = await db();
  const [fin, acc] = await Promise.all([getFinance(), getAccSettings()]);
  const want = new Map<string, Spec>();
  const sumBy = (lines: { type: string; amount: number }[], map: Record<string, string>, fallback: string) => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(map[l.type] ?? fallback, (m.get(map[l.type] ?? fallback) ?? 0) + (Number(l.amount) || 0));
    return [...m.entries()];
  };

  for (const inv of await d.collection('invoices').find({ status: { $in: ['posted', 'paid'] } }).toArray()) {
    const id = String(inv._id), t = docTotals(inv.lines || []), partner = String(inv.contactId), num = String(inv.number);
    const origin = { model: 'invoice', id };
    want.set(`invoice:${id}:post`, {
      journal: 'VEN', date: inv.date, label: `Customer invoice ${num}`, partnerId: partner, origin,
      lines: [L(acc.receivable, t.total, 0, num, partner), ...sumBy(inv.lines || [], acc.rev, '7064').map(([a, v]) => L(a, 0, v, num, partner)),
        ...(t.vat ? [L(acc.vatOut, 0, t.vat, `VAT ${num}`, partner)] : [])],
    });
    for (const p of inv.payments || []) {
      want.set(`invoice:${id}:pay:${p.id}`, {
        journal: p.accountId, date: p.date, label: `Receipt ${p.ref} for ${num}`, partnerId: partner, origin,
        lines: [L(paymentLedger(fin, acc, p.accountId), p.amount, 0, p.ref, partner), L(acc.receivable, 0, p.amount, num, partner)],
      });
    }
  }
  for (const po of await d.collection('purchases').find({ status: { $in: ['billed', 'paid'] } }).toArray()) {
    const id = String(po._id), t = docTotals(po.lines || []), partner = String(po.supplierId), ref = String(po.billRef || po.ref);
    const origin = { model: 'purchase', id };
    want.set(`purchase:${id}:bill`, {
      journal: 'ACH', date: po.billDate || po.orderDate, label: `Supplier bill ${ref}`, partnerId: partner, origin,
      lines: [...sumBy(po.lines || [], acc.cost, '6044').map(([a, v]) => L(a, v, 0, String(po.ref), partner)),
        ...(t.vat ? [L(acc.vatIn, t.vat, 0, `VAT ${po.ref}`, partner)] : []), L(acc.payable, 0, t.total, ref, partner)],
    });
    for (const p of po.payments || []) {
      want.set(`purchase:${id}:pay:${p.id}`, {
        journal: p.accountId, date: p.date, label: `Voucher ${p.ref} for ${po.ref}`, partnerId: partner, origin,
        lines: [L(acc.payable, p.amount, 0, String(po.ref), partner), L(paymentLedger(fin, acc, p.accountId), 0, p.amount, p.ref, partner)],
      });
    }
  }
  for (const e of await d.collection('expenses').find({ status: 'posted' }).toArray()) {
    const id = String(e._id), amount = Number(e.amount) || 0, vat = r2(amount * (Number(e.vat) || 0) / 100), total = r2(amount + vat);
    const credit = e.paidFrom === 'supplier';
    const partner = String(e.supplierId || '');
    want.set(`expense:${id}`, {
      journal: credit ? 'ACH' : String(e.paidFrom), date: e.date, label: `Expense ${e.ref}: ${e.description}`, partnerId: partner, origin: { model: 'expense', id },
      lines: [L(acc.expense[e.categoryId] ?? '658', amount, 0, String(e.description), partner), ...(vat ? [L(acc.vatIn, vat, 0, 'VAT', partner)] : []),
        credit ? L(acc.payable, 0, total, String(e.ref), partner) : L(paymentLedger(fin, acc, String(e.paidFrom)), 0, total, String(e.ref), partner)],
    });
  }

  const moves = d.collection('moves');
  const have = new Map((await moves.find({ key: { $exists: true } }, { projection: { key: 1, hash: 1 } }).toArray()).map((m) => [String(m.key), m]));
  for (const [key, spec] of want) {
    spec.lines = spec.lines.filter((l) => l.debit || l.credit);
    const hash = hashOf(spec), m = have.get(key);
    if (m && m.hash === hash) continue;
    if (m) await moves.deleteOne({ _id: m._id });
    try {
      await moves.insertOne({
        ...spec, ref: await moveRef(spec.journal, spec.date), status: 'posted', auto: true, key, hash,
        lines: spec.lines.map((l) => ({ id: randomUUID(), ...l })), createdAt: new Date(), createdBy: 'System',
      });
    } catch (e) {
      if (!(e && typeof e === 'object' && 'code' in e && (e as { code: number }).code === 11000)) throw e;
    }
  }
  for (const [key, m] of have) if (!want.has(key)) await moves.deleteOne({ _id: m._id });
}

/* ---------- Reading the books ---------- */
export const toMove = (m: WithId<Document>): Move => ({
  id: String(m._id), ref: m.ref ?? null, journal: m.journal, date: m.date, label: m.label || '', partnerId: m.partnerId || '', status: m.status,
  auto: !!m.auto, origin: m.origin, createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  lines: ((m.lines as MoveLine[]) || []).map((l) => ({ id: l.id, account: l.account, partnerId: l.partnerId || '', label: l.label || '', debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
});

export async function listMoves(opts: { journal?: string; q?: string; from?: string; to?: string } = {}) {
  const f: Record<string, unknown> = {};
  if (opts.journal && opts.journal !== 'all') f.journal = opts.journal;
  if (opts.from || opts.to) f.date = { ...(opts.from ? { $gte: opts.from } : {}), ...(opts.to ? { $lte: opts.to } : {}) };
  if (opts.q) { const rx = { $regex: opts.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; f.$or = [{ ref: rx }, { label: rx }]; }
  return (await (await db()).collection('moves').find(f).sort({ date: -1, ref: -1 }).limit(500).toArray()).map(toMove);
}
export async function getMove(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const m = await (await db()).collection('moves').findOne({ _id: new ObjectId(id) });
  return m ? toMove(m) : null;
}

/** Debit and credit totals per account for posted entries, between two dates (from may be empty for "since the start"). */
export async function balances(from: string | null, to: string) {
  const date: Record<string, string> = { $lte: to };
  if (from) date.$gte = from;
  const rows = await (await db()).collection('moves').aggregate([
    { $match: { status: 'posted', date } }, { $unwind: '$lines' },
    { $group: { _id: '$lines.account', d: { $sum: '$lines.debit' }, c: { $sum: '$lines.credit' } } },
  ]).toArray();
  return new Map(rows.map((r) => [String(r._id), { d: r2(r.d), c: r2(r.c) }]));
}

export async function ledger(code: string, from: string, to: string) {
  const d = await db();
  const before = await d.collection('moves').aggregate([
    { $match: { status: 'posted', date: { $lt: from } } }, { $unwind: '$lines' }, { $match: { 'lines.account': code } },
    { $group: { _id: null, v: { $sum: { $subtract: ['$lines.debit', '$lines.credit'] } } } },
  ]).toArray();
  const items = await d.collection('moves').aggregate([
    { $match: { status: 'posted', date: { $gte: from, $lte: to } } }, { $unwind: '$lines' }, { $match: { 'lines.account': code } }, { $sort: { date: 1, ref: 1 } },
  ]).toArray();
  return { opening: r2(before[0]?.v ?? 0), items: items.map((m) => ({ moveId: String(m._id), ref: String(m.ref), date: String(m.date), label: String(m.lines.label || m.label), partnerId: String(m.lines.partnerId || ''), debit: Number(m.lines.debit) || 0, credit: Number(m.lines.credit) || 0 })) };
}

/** Customer and supplier balances still open, aged by due date. Expenses bought on credit are counted in the ledger only. */
export async function outstanding(side: 'rec' | 'pay') {
  const d = await db();
  const today = todayISO();
  if (side === 'rec') {
    const invs = await d.collection('invoices').find({ status: 'posted' }).toArray();
    return invs.map((i) => ({ partnerId: String(i.contactId), doc: String(i.number), date: String(i.date), due: String(i.dueDate), total: docTotals(i.lines || []).total, balance: docTotals(i.lines || [], i.payments || []).balance, href: `/invoicing/${i._id}`, bucket: ageBucket(String(i.dueDate), today) })).filter((x) => x.balance > 0.004);
  }
  const fin = await getFinance();
  const pos = await d.collection('purchases').find({ status: 'billed' }).toArray();
  return pos.map((p) => {
    const due = addDays(String(p.billDate || p.orderDate), fin.supplierTerms);
    return { partnerId: String(p.supplierId), doc: p.billRef ? `${p.ref}, bill ${p.billRef}` : String(p.ref), date: String(p.billDate || p.orderDate), due, total: docTotals(p.lines || []).total, balance: docTotals(p.lines || [], p.payments || []).balance, href: `/purchasing/${p._id}`, bucket: ageBucket(due, today) };
  }).filter((x) => x.balance > 0.004);
}

export async function contactNames() {
  const cs = await (await db()).collection('contacts').find({}, { projection: { name: 1, type: 1 } }).sort({ name: 1 }).toArray();
  return cs.map((c) => ({ id: String(c._id), name: String(c.name), type: String(c.type) }));
}
