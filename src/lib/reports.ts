import { ObjectId } from 'mongodb';
import { db } from './db';
import { CHANNEL, r2, sell, type Channel } from './constants';

/**
 * Report periods: a year (2026), a quarter (2026-Q2), a month (2026-05), or the last 12 months (12m).
 * Returns the range and the months it covers, for monthly charts.
 */
export function reportPeriod(p: string, today: string): { from: string; to: string; months: string[]; label: string } {
  let from: string, to: string, label: string;
  const ym = (d: Date) => d.toISOString().slice(0, 7);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) {
    const [y, m] = p.split('-').map(Number);
    from = `${p}-01`; to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  } else if (/^\d{4}-Q[1-4]$/.test(p)) {
    const y = Number(p.slice(0, 4)), q = Number(p.slice(6));
    from = `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`; to = new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10); label = `Q${q} ${y}`;
  } else if (p === '12m') {
    const t = new Date(today + 'T00:00:00Z');
    from = ym(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 11, 1))) + '-01'; to = today; label = 'Last 12 months';
  } else {
    const y = /^\d{4}$/.test(p) ? p : today.slice(0, 4);
    from = `${y}-01-01`; to = `${y}-12-31`; label = y;
  }
  const months: string[] = [];
  for (let d = new Date(from + 'T00:00:00Z'); ym(d) <= to.slice(0, 7); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(ym(d));
  return { from, to, months, label };
}

export type SaleLine = { type: string; supplierId: string; supplierName: string; productId: string; price: number; cost: number };
export type Sale = {
  id: string; ref: string; date: string; month: string; status: string; channel: Channel; contactId: string; contactName: string;
  createdBy: string; destination: string; price: number; cost: number; margin: number; lines: SaleLine[]; fromPortal: boolean;
};

/**
 * Sales are confirmed bookings (confirmed, ticketed or invoiced), dated by their booking date. Price is the selling
 * price before VAT, cost what suppliers charge, margin the difference. Drafts and cancelled bookings are left out.
 */
export async function salesIn(from: string, to: string): Promise<Sale[]> {
  const d = await db();
  const bs = await d.collection('bookings').find({ status: { $in: ['confirmed', 'ticketed', 'invoiced'] }, bookingDate: { $gte: from, $lte: to } }).toArray();
  const cids = [...new Set(bs.flatMap((b) => [String(b.contactId), ...((b.lines as { supplierId?: string }[]) || []).map((l) => String(l.supplierId || ''))]))].filter((x) => ObjectId.isValid(x));
  const cs = cids.length ? await d.collection('contacts').find({ _id: { $in: cids.map((x) => new ObjectId(x)) } }, { projection: { name: 1, type: 1 } }).toArray() : [];
  const c = (id: unknown) => cs.find((x) => String(x._id) === String(id));
  return bs.map((b) => {
    const lines: SaleLine[] = ((b.lines as { type: string; supplierId?: string; productId?: string; cost: number; markup: number; markupType?: 'percent' | 'amount' }[]) || []).map((l) => ({
      type: l.type, supplierId: String(l.supplierId || ''), supplierName: String(c(l.supplierId)?.name ?? 'No supplier'), productId: String(l.productId || ''),
      price: sell(l), cost: Number(l.cost) || 0,
    }));
    const price = r2(lines.reduce((s, l) => s + l.price, 0)), cost = r2(lines.reduce((s, l) => s + l.cost, 0));
    const cc = c(b.contactId);
    return {
      id: String(b._id), ref: String(b.ref), date: String(b.bookingDate), month: String(b.bookingDate).slice(0, 7), status: String(b.status),
      channel: CHANNEL[String(cc?.type ?? 'customer')] ?? 'B2C', contactId: String(b.contactId), contactName: String(cc?.name ?? ''),
      createdBy: String(b.createdBy || 'Unknown'), destination: String(b.destinationName || b.destination || 'Not set'),
      price, cost, margin: r2(price - cost), lines, fromPortal: !!b.requestId,
    };
  });
}

/** Totals grouped by any key. */
export function group<T>(rows: T[], key: (r: T) => string, val: (r: T) => { price: number; cost: number; n?: number }) {
  const m = new Map<string, { key: string; price: number; cost: number; margin: number; n: number }>();
  for (const r of rows) {
    const k = key(r), v = val(r);
    const g = m.get(k) ?? { key: k, price: 0, cost: 0, margin: 0, n: 0 };
    g.price = r2(g.price + v.price); g.cost = r2(g.cost + v.cost); g.margin = r2(g.price - g.cost); g.n += v.n ?? 1;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.price - a.price);
}

/** Pipeline figures: opportunities created in the period and where they stand now, plus portal requests. */
export async function crmIn(from: string, to: string) {
  const d = await db();
  const fromD = new Date(from + 'T00:00:00Z'), toD = new Date(to + 'T23:59:59Z');
  const leads = await d.collection('leads').find({ createdAt: { $gte: fromD, $lte: toD } }).toArray();
  const reqs = await d.collection('requests').find({ createdAt: { $gte: fromD, $lte: toD } }).toArray();
  return {
    leads: leads.map((l) => ({ stage: String(l.stage), budget: Number(l.budget) || 0, portal: !!l.requestId, by: String(l.createdBy || '') })),
    requests: reqs.map((r) => ({ status: String(r.status), contactId: String(r.contactId), amount: Number(r.quote?.amount) || 0 })),
  };
}

/** Rows as CSV, with a byte-order mark so Excel opens accents and currency symbols correctly. */
export function toCsv(head: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '\uFEFF' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export type Col = { h: string; kind?: 'money' | 'pct' | 'num' };
export type Table = { title: string; cols: Col[]; rows: (string | number)[][]; total?: (string | number)[]; note?: string };
const pct = (m: number, p: number) => (p ? r2((m / p) * 100) : 0);
const SVC: Record<string, string> = { flight: 'Flight', hotel: 'Hotel', transfer: 'Transfer', visa: 'Visa', package: 'Package', insurance: 'Insurance', other: 'Other' };
const monthName = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Every report table, built once and used by both the page and the CSV export. */
export async function reportTables(sales: Sale[], months: string[], crm: Awaited<ReturnType<typeof crmIn>>): Promise<Record<string, Table>> {
  const tot = { price: r2(sales.reduce((s, x) => s + x.price, 0)), cost: r2(sales.reduce((s, x) => s + x.cost, 0)) };
  const margin = r2(tot.price - tot.cost);
  const std: Col[] = [{ h: 'Bookings', kind: 'num' }, { h: 'Sales', kind: 'money' }, { h: 'Cost', kind: 'money' }, { h: 'Margin', kind: 'money' }, { h: 'Margin %', kind: 'pct' }];
  const row = (g: { key: string; price: number; cost: number; margin: number; n: number }, label = g.key) => [label, g.n, g.price, g.cost, g.margin, pct(g.margin, g.price)];
  const totalRow = (label = 'Total', n = sales.length) => [label, n, tot.price, tot.cost, margin, pct(margin, tot.price)];
  const byMonth = group(sales, (s) => s.month, (s) => s);
  const lines = sales.flatMap((s) => s.lines.map((l) => ({ ...l, s })));
  const d = await db();
  const pids = [...new Set(lines.map((l) => l.productId).filter((x) => ObjectId.isValid(x)))];
  const prods = pids.length ? await d.collection('products').find({ _id: { $in: pids.map((x) => new ObjectId(x)) } }, { projection: { name: 1 } }).toArray() : [];
  const custCh = new Map(sales.map((s) => [s.contactName, s.channel]));
  const L = crm.leads, Rq = crm.requests;
  const won = L.filter((l) => l.stage === 'won').length, lost = L.filter((l) => l.stage === 'lost').length;
  const stages: [string, string][] = [['new', 'New'], ['qualified', 'Qualified'], ['quoted', 'Quote sent'], ['won', 'Won'], ['lost', 'Lost']];
  const rqStates: [string, string][] = [['submitted', 'Submitted'], ['review', 'In review'], ['quoted', 'Quoted'], ['approval', 'Waiting for approval'], ['booked', 'Booked'], ['declined', 'Declined'], ['cancelled', 'Withdrawn']];
  return {
    monthly: {
      title: 'Sales by month', cols: [{ h: 'Month' }, ...std],
      rows: months.map((m) => { const g = byMonth.find((x) => x.key === m) ?? { key: m, price: 0, cost: 0, margin: 0, n: 0 }; return row(g, monthName(m)); }), total: totalRow(),
    },
    channel: { title: 'Sales by channel', cols: [{ h: 'Channel' }, ...std], rows: group(sales, (s) => s.channel, (s) => s).map((g) => row(g)), total: totalRow() },
    service: {
      title: 'Sales by service type', cols: [{ h: 'Service' }, { h: 'Services', kind: 'num' }, ...std.slice(1)],
      rows: group(lines, (l) => SVC[l.type] ?? l.type, (l) => l).map((g) => row(g)), total: ['Total', lines.length, tot.price, tot.cost, margin, pct(margin, tot.price)],
    },
    staff: { title: 'Sales by staff member', cols: [{ h: 'Booked by' }, ...std], rows: group(sales, (s) => s.createdBy, (s) => s).map((g) => row(g)), total: totalRow(), note: 'The person who created the booking. Bookings created from a portal request count for whoever accepted the quote.' },
    customers: {
      title: 'Top customers', cols: [{ h: 'Customer' }, { h: 'Channel' }, { h: 'Bookings', kind: 'num' }, { h: 'Sales', kind: 'money' }, { h: 'Margin', kind: 'money' }, { h: 'Margin %', kind: 'pct' }, { h: 'Share of sales', kind: 'pct' }],
      rows: group(sales, (s) => s.contactName, (s) => s).map((g) => [g.key, custCh.get(g.key) ?? '', g.n, g.price, g.margin, pct(g.margin, g.price), pct(g.price, tot.price)]),
      total: ['Total', '', sales.length, tot.price, margin, pct(margin, tot.price), tot.price ? 100 : 0],
    },
    destinations: {
      title: 'Top destinations', cols: [{ h: 'Destination' }, { h: 'Bookings', kind: 'num' }, { h: 'Sales', kind: 'money' }, { h: 'Margin', kind: 'money' }, { h: 'Margin %', kind: 'pct' }, { h: 'Average sale', kind: 'money' }],
      rows: group(sales, (s) => s.destination, (s) => s).map((g) => [g.key, g.n, g.price, g.margin, pct(g.margin, g.price), r2(g.price / (g.n || 1))]),
      total: ['Total', sales.length, tot.price, margin, pct(margin, tot.price), r2(tot.price / (sales.length || 1))],
    },
    suppliers: {
      title: 'Suppliers', cols: [{ h: 'Supplier' }, { h: 'Services', kind: 'num' }, { h: 'Bought (cost)', kind: 'money' }, { h: 'Sold for', kind: 'money' }, { h: 'Margin', kind: 'money' }, { h: 'Margin %', kind: 'pct' }],
      rows: group(lines, (l) => l.supplierName, (l) => l).sort((a, b) => b.cost - a.cost).map((g) => [g.key, g.n, g.cost, g.price, g.margin, pct(g.margin, g.price)]),
      total: ['Total', lines.length, tot.cost, tot.price, margin, pct(margin, tot.price)], note: 'Cost is what the services were booked at. Supplier bills and payments are in Purchasing and Accounting.',
    },
    products: {
      title: 'Catalogue products sold', cols: [{ h: 'Product' }, { h: 'Times sold', kind: 'num' }, { h: 'Sales', kind: 'money' }, { h: 'Margin', kind: 'money' }, { h: 'Margin %', kind: 'pct' }],
      rows: group(lines.filter((l) => l.productId), (l) => String(prods.find((p) => String(p._id) === l.productId)?.name ?? 'Deleted product'), (l) => l).map((g) => [g.key, g.n, g.price, g.margin, pct(g.margin, g.price)]),
      note: 'Services added with Add from catalogue. Services typed in by hand are not counted here.',
    },
    pipeline: {
      title: 'Opportunities created in the period, by current stage', cols: [{ h: 'Stage' }, { h: 'Opportunities', kind: 'num' }, { h: 'From the portal', kind: 'num' }, { h: 'Budget', kind: 'money' }],
      rows: stages.map(([k, l]) => { const s = L.filter((x) => x.stage === k); return [l, s.length, s.filter((x) => x.portal).length, r2(s.reduce((a, x) => a + x.budget, 0))]; }),
      total: ['Total', L.length, L.filter((x) => x.portal).length, r2(L.reduce((a, x) => a + x.budget, 0))],
      note: `Win rate ${won + lost ? Math.round((won / (won + lost)) * 100) : 0}%: won out of opportunities that are decided (won or lost).`,
    },
    requests: {
      title: 'Portal requests created in the period, by status', cols: [{ h: 'Status' }, { h: 'Requests', kind: 'num' }, { h: 'Quoted amount', kind: 'money' }],
      rows: rqStates.map(([k, l]) => { const s = Rq.filter((x) => x.status === k); return [l, s.length, r2(s.reduce((a, x) => a + x.amount, 0))]; }).filter((r) => r[1]),
      total: ['Total', Rq.length, r2(Rq.reduce((a, x) => a + x.amount, 0))],
      note: `${Rq.length ? Math.round((Rq.filter((x) => x.status === 'booked').length / Rq.length) * 100) : 0}% of portal requests became bookings.`,
    },
  };
}

/** For a role without costs and margins: the same table without its cost, margin and markup columns. */
export function withoutCosts(t: Table): Table {
  const keep = t.cols.map((c, i) => (/^(cost|margin|markup)/i.test(c.h) ? -1 : i)).filter((i) => i >= 0);
  return { ...t, cols: keep.map((i) => t.cols[i]), rows: t.rows.map((r) => keep.map((i) => r[i])), total: t.total ? keep.map((i) => t.total![i]) : undefined, note: t.note?.replace(/Cost is what[^.]*\./, '') };
}
