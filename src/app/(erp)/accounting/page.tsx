import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { balances, contactNames, getAccSettings, getChart, journals, listMoves, outstanding, rateOf, syncAccounting } from '@/lib/accounting';
import { getFinance, listInvoices } from '@/lib/finance';
import { AGE, ACC_CLASSES, fmtDate, money, periodRange, r2, todayISO } from '@/lib/constants';
import { SearchBox } from '@/components/SearchBox';
import { Tabs } from '@/components/ListChrome';
import { ChartPanel } from '@/components/ChartPanel';
import { AccSettingsForm } from '@/components/AccSettingsForm';

type SP = Promise<{ tab?: string; p?: string; ccy?: string; journal?: string; q?: string; side?: string }>;
const TABS: [string, string][] = [['entries', 'Journal entries'], ['outstanding', 'Outstanding'], ['tb', 'Trial balance'], ['pl', 'Profit and loss'], ['bs', 'Balance sheet'], ['vat', 'VAT'], ['chart', 'Chart of accounts'], ['settings', 'Settings']];

export default async function AccountingPage({ searchParams }: { searchParams: SP }) {
  const user = await getSession();
  if (user?.role !== 'admin') return <div className="empty">Only administrators can open Accounting. Ask an administrator for access.</div>;
  await syncAccounting();
  const sp = await searchParams;
  const year = new Date().getFullYear();
  const { tab = 'entries', p = String(year), ccy = 'USD', journal = 'all', q, side = 'rec' } = sp;
  const [from, to] = periodRange(p);
  const [chart, acc, fin, contacts] = await Promise.all([getChart(), getAccSettings(), getFinance(), contactNames()]);
  const lbp = rateOf(acc, 'LBP');
  const fmt = (n: number) => (ccy === 'LBP' ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n * lbp))} LBP` : money(n));
  const name = (c: string) => chart.find((a) => a.code === c)?.name ?? '';
  const partner = (id: string) => contacts.find((c) => c.id === id)?.name ?? '';
  const link = (over: Record<string, string>) => { const u = new URLSearchParams({ tab, p, ccy, ...over }); return `/accounting?${u}`; };
  const pyear = p.slice(0, 4);
  const periods: [string, string][] = [[pyear, `Year ${pyear}`], ...[1, 2, 3, 4].map((n) => [`${pyear}-Q${n}`, `Q${n} ${pyear}`] as [string, string])];
  const periodBar = (
    <div className="cp-tools">
      <div className="chips">
        <Link className="chip" href={link({ p: String(Number(pyear) - 1) })} aria-label="Previous year">‹</Link>
        {periods.map(([k, l]) => <Link key={k} className={`chip ${p === k ? 'on' : ''}`} href={link({ p: k })}>{l}</Link>)}
        <Link className="chip" href={link({ p: String(Number(pyear) + 1) })} aria-label="Next year">›</Link>
      </div>
      <div className="chips">{['USD', 'LBP'].map((c) => <Link key={c} className={`chip ${ccy === c ? 'on' : ''}`} href={link({ ccy: c })}>{c === 'USD' ? 'USD' : 'LBP equivalent'}</Link>)}</div>
    </div>
  );

  let body: React.ReactNode = null;
  if (tab === 'entries') {
    const moves = await listMoves({ journal, q, from, to });
    const js = journals(fin);
    body = (
      <>
        <div className="cp-tools" style={{ marginBottom: 12 }}>
          <SearchBox placeholder="Search number or reference" />
          <div className="chips">{[['all', 'All journals'] as [string, string], ...js.map((j) => [j.code, j.name] as [string, string])].map(([k, l]) => <Link key={k} className={`chip ${journal === k ? 'on' : ''}`} href={link({ journal: k })}>{l}</Link>)}</div>
        </div>
        {moves.length === 0 ? <div className="empty">No journal entries in this period. Entries appear automatically when you post invoices, record payments, bills and expenses.</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Number</th><th>Journal</th><th>Partner</th><th>Reference</th><th>Source</th><th>Status</th><th className="num">Amount</th></tr></thead>
            <tbody>{moves.map((m) => (
              <tr key={m.id}><td>{fmtDate(m.date)}</td><td><Link href={`/accounting/entries/${m.id}`}><strong>{m.ref ?? 'Draft'}</strong></Link></td><td>{m.journal}</td>
                <td>{partner(m.partnerId)}</td><td>{m.label}</td><td className="muted">{m.auto ? 'Automatic' : 'Manual'}</td>
                <td><span className={`badge ${m.status === 'posted' ? 'b-green' : ''}`}>{m.status === 'posted' ? 'Posted' : 'Draft'}</span></td>
                <td className="num">{fmt(r2(m.lines.reduce((s, l) => s + l.debit, 0)))}</td></tr>))}
            </tbody></table></div>
        )}
      </>
    );
  } else if (tab === 'chart') {
    const bal = await balances(null, to);
    const shown: Record<string, string> = {};
    for (const [c, b] of bal) { const v = r2(b.d - b.c); if (v) shown[c] = `${fmt(Math.abs(v))} ${v > 0 ? 'Dr' : 'Cr'}`; }
    body = <ChartPanel chart={chart} balances={shown} period={p} />;
  } else if (tab === 'tb') {
    const bal = await balances(from, to);
    const rows = [...bal.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let td = 0, tc = 0, bd = 0, bc = 0;
    body = rows.length === 0 ? <div className="empty">No posted entries in this period.</div> : (
      <div className="table-wrap"><table>
        <thead><tr><th>Code</th><th>Account</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Debit balance</th><th className="num">Credit balance</th></tr></thead>
        <tbody>{rows.map(([c, b]) => { const v = r2(b.d - b.c); td += b.d; tc += b.c; if (v > 0) bd += v; else bc -= v; return (
          <tr key={c}><td><Link href={`/accounting/ledger/${c}?p=${p}`}><strong>{c}</strong></Link></td><td>{name(c)}</td><td className="num">{fmt(b.d)}</td><td className="num">{fmt(b.c)}</td><td className="num">{v > 0 ? fmt(v) : ''}</td><td className="num">{v < 0 ? fmt(-v) : ''}</td></tr>); })}
        </tbody>
        <tfoot><tr><td colSpan={2}><b>Total</b></td><td className="num"><b>{fmt(td)}</b></td><td className="num"><b>{fmt(tc)}</b></td><td className="num"><b>{fmt(bd)}</b></td><td className="num"><b>{fmt(bc)}</b></td></tr></tfoot>
      </table></div>
    );
  } else if (tab === 'pl' || tab === 'bs') {
    const bal = await balances(tab === 'pl' ? from : null, to);
    const section = (cls: string, sign: 1 | -1) => [...bal.entries()].filter(([c]) => c.startsWith(cls)).sort((a, b) => a[0].localeCompare(b[0])).map(([c, b]) => [c, r2(sign * (b.d - b.c))] as [string, number]).filter(([, v]) => v);
    const inc = section('7', -1), exp = section('6', 1);
    const ti = r2(inc.reduce((s, x) => s + x[1], 0)), te = r2(exp.reduce((s, x) => s + x[1], 0)), net = r2(ti - te);
    const rows = (list: [string, number][]) => list.length ? list.map(([c, v]) => <tr key={c}><td><Link href={`/accounting/ledger/${c}?p=${p}`}>{c} {name(c)}</Link></td><td className="num">{fmt(v)}</td></tr>) : <tr><td colSpan={2} className="muted">Nothing in this period.</td></tr>;
    if (tab === 'pl') {
      body = (
        <>
          <div className="rgrid">
            <section className="sheet"><h2>Revenues, class 7</h2><table className="stmt"><tbody>{rows(inc)}</tbody><tfoot><tr><td>Total revenues</td><td className="num">{fmt(ti)}</td></tr></tfoot></table></section>
            <section className="sheet"><h2>Expenses, class 6</h2><table className="stmt"><tbody>{rows(exp)}</tbody><tfoot><tr><td>Total expenses</td><td className="num">{fmt(te)}</td></tr></tfoot></table></section>
          </div>
          <section className="sheet result"><span>{net >= 0 ? 'Net profit' : 'Net loss'}, {fmtDate(from)} to {fmtDate(to)}</span><b>{fmt(Math.abs(net))}</b></section>
        </>
      );
    } else {
      const assets: [string, number][] = [], liab: [string, number][] = [];
      for (const [c, b] of [...bal.entries()].sort((a, b2) => a[0].localeCompare(b2[0]))) {
        const v = r2(b.d - b.c);
        if (!v) continue;
        if (c[0] === '2' || c[0] === '3') assets.push([c, v]);
        else if (c[0] === '4' || c[0] === '5') { if (v > 0) assets.push([c, v]); else liab.push([c, -v]); }
        else if (c[0] === '1') liab.push([c, -v]);
      }
      const ta = r2(assets.reduce((s, x) => s + x[1], 0)), tl = r2(liab.reduce((s, x) => s + x[1], 0) + net);
      body = (
        <>
          <p className="hint" style={{ marginTop: 0 }}>Position on {fmtDate(to)}, from all posted entries up to that date.</p>
          <div className="rgrid">
            <section className="sheet"><h2>Assets</h2><table className="stmt"><tbody>{rows(assets)}</tbody><tfoot><tr><td>Total assets</td><td className="num">{fmt(ta)}</td></tr></tfoot></table></section>
            <section className="sheet"><h2>Equity and liabilities</h2><table className="stmt"><tbody>{rows(liab)}<tr><td>Result to date, not yet closed</td><td className="num">{fmt(net)}</td></tr></tbody><tfoot><tr><td>Total equity and liabilities</td><td className="num">{fmt(tl)}</td></tr></tfoot></table></section>
          </div>
          {Math.abs(ta - tl) > 0.01 && <p className="form-error">The two sides differ by {fmt(Math.abs(ta - tl))}. Check manual entries for accounts outside classes 1 to 7.</p>}
        </>
      );
    }
  } else if (tab === 'vat') {
    const bal = await balances(from, to);
    const out = r2((bal.get(acc.vatOut)?.c ?? 0) - (bal.get(acc.vatOut)?.d ?? 0)), inp = r2((bal.get(acc.vatIn)?.d ?? 0) - (bal.get(acc.vatIn)?.c ?? 0)), net = r2(out - inp);
    const invs = (await listInvoices({})).filter((i) => i.status !== 'draft' && i.date >= from && i.date <= to);
    const byRate = new Map<number, { base: number; vat: number }>();
    for (const i of invs) for (const l of i.lines) { const r = byRate.get(l.vat) ?? { base: 0, vat: 0 }; r.base = r2(r.base + l.amount); r.vat = r2(r.vat + r2(l.amount * l.vat / 100)); byRate.set(l.vat, r); }
    const both = (n: number) => <>{money(n)}<span className="muted" style={{ display: 'block', fontSize: 13 }}>{new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n * lbp))} LBP</span></>;
    body = (
      <>
        <div className="kpis">
          <div className="kpi"><span>VAT collected, {acc.vatOut}</span><b>{both(out)}</b></div>
          <div className="kpi"><span>VAT recoverable, {acc.vatIn}</span><b>{both(inp)}</b></div>
          <div className="kpi"><span>{net >= 0 ? 'Net VAT payable' : 'VAT credit to carry forward'}</span><b>{both(Math.abs(net))}</b></div>
        </div>
        <section className="sheet"><h2>Sales by VAT rate</h2>
          <table className="stmt"><thead><tr><th style={{ textAlign: 'left' }}>Rate</th><th className="num">Taxable base</th><th className="num">VAT</th></tr></thead>
            <tbody>{[...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([k, v]) => <tr key={k}><td>{k === 0 ? '0%, exempt or outside scope' : `${k}%`}</td><td className="num">{fmt(v.base)}</td><td className="num">{fmt(v.vat)}</td></tr>)}
              {byRate.size === 0 && <tr><td colSpan={3} className="muted">No posted invoices in this period.</td></tr>}</tbody></table>
          <p className="hint">Lebanese VAT returns are filed quarterly, so choose a quarter above. LBP amounts use {new Intl.NumberFormat('en-US').format(lbp)} LBP per USD from Settings, last changed {fmtDate(acc.ratesUpdated)}. Check the rate your accountant uses for the return.</p>
        </section>
      </>
    );
  } else if (tab === 'outstanding') {
    const items = await outstanding(side === 'pay' ? 'pay' : 'rec');
    const by = new Map<string, Record<string, number>>();
    for (const x of items) { const r = by.get(x.partnerId) ?? { nd: 0, a30: 0, a60: 0, a90: 0, a90p: 0, total: 0 }; r[x.bucket] = r2(r[x.bucket] + x.balance); r.total = r2(r.total + x.balance); by.set(x.partnerId, r); }
    const tot: Record<string, number> = { nd: 0, a30: 0, a60: 0, a90: 0, a90p: 0, total: 0 };
    for (const r of by.values()) for (const k of Object.keys(tot)) tot[k] = r2(tot[k] + r[k]);
    const today = todayISO();
    body = (
      <>
        <div className="chips" style={{ marginBottom: 14 }}>{[['rec', 'Customers owe you'], ['pay', 'You owe suppliers']].map(([k, l]) => <Link key={k} className={`chip ${side === k ? 'on' : ''}`} href={link({ side: k })}>{l}</Link>)}</div>
        <div className="kpis"><div className="kpi"><span>Total outstanding</span><b>{fmt(tot.total)}</b></div><div className="kpi"><span>Overdue</span><b>{fmt(r2(tot.total - tot.nd))}</b></div><div className="kpi"><span>{side === 'pay' ? 'Suppliers' : 'Customers'} with a balance</span><b>{by.size}</b></div></div>
        {items.length === 0 ? <div className="empty">{side === 'pay' ? 'You don’t owe any supplier on billed orders right now.' : 'No customer owes you anything right now.'}</div> : (
          <>
            <div className="table-wrap" style={{ marginBottom: 16 }}><table>
              <thead><tr><th>{side === 'pay' ? 'Supplier' : 'Customer'}</th>{AGE.map(([k, l]) => <th key={k} className="num">{l}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>{[...by.entries()].sort((a, b) => b[1].total - a[1].total).map(([pid, r]) => (
                <tr key={pid}><td><Link href={`/contacts/${pid}`}><strong>{partner(pid)}</strong></Link></td>{AGE.map(([k]) => <td key={k} className={`num ${k !== 'nd' && r[k] ? 'overdue' : ''}`}>{r[k] ? fmt(r[k]) : ''}</td>)}<td className="num"><b>{fmt(r.total)}</b></td></tr>))}
              </tbody>
              <tfoot><tr><td><b>Total</b></td>{AGE.map(([k]) => <td key={k} className="num"><b>{fmt(tot[k])}</b></td>)}<td className="num"><b>{fmt(tot.total)}</b></td></tr></tfoot>
            </table></div>
            <section className="sheet"><h2>Open documents</h2><div className="table-wrap"><table>
              <thead><tr><th>Document</th><th>{side === 'pay' ? 'Supplier' : 'Customer'}</th><th>Date</th><th>Due</th><th className="num">Days overdue</th><th className="num">Total</th><th className="num">Balance</th></tr></thead>
              <tbody>{items.sort((a, b) => a.due.localeCompare(b.due)).map((x) => { const late = Math.floor((Date.parse(today) - Date.parse(x.due)) / 86400000); return (
                <tr key={x.href}><td><Link href={x.href}><strong>{x.doc}</strong></Link></td><td>{partner(x.partnerId)}</td><td>{fmtDate(x.date)}</td><td>{fmtDate(x.due)}</td>
                  <td className={`num ${late > 0 ? 'overdue' : ''}`}>{late > 0 ? late : ''}</td><td className="num">{fmt(x.total)}</td><td className="num"><b>{fmt(x.balance)}</b></td></tr>); })}
              </tbody></table></div></section>
          </>
        )}
        <p className="hint">{side === 'pay' ? `Supplier bills are due ${fin.supplierTerms} days after the bill date (Settings). Expenses bought on credit show in the ledger of account ${acc.payable}.` : 'Based on posted invoices that aren’t fully paid, aged by due date.'}</p>
      </>
    );
  } else if (tab === 'settings') {
    body = <AccSettingsForm initial={acc} chart={chart} finance={fin} />;
  }

  const showPeriod = ['entries', 'tb', 'pl', 'bs', 'vat', 'chart'].includes(tab);
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Accounting</h1></div>
        <div className="cp-actions">
          <Link className="btn" href="/accounting/entries/new?opening=1">Opening balances</Link>
          <Link className="btn primary" href="/accounting/entries/new">New journal entry</Link>
        </div>
        <Tabs base="/accounting" current={tab} items={TABS} />
        {showPeriod && periodBar}
      </div>
      {body}
      {tab !== 'settings' && <p className="hint" style={{ marginTop: 16 }}>{Object.values(ACC_CLASSES).length} account classes, {chart.length} accounts. Entries from documents are created automatically each time this page opens.</p>}
    </>
  );
}
