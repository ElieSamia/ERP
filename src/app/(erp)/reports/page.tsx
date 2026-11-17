import Link from 'next/link';
import { crmIn, reportPeriod, reportTables, salesIn, type Table } from '@/lib/reports';
import { money, r2, todayISO } from '@/lib/constants';
import { Tabs } from '@/components/ListChrome';
import { PrintButton } from '@/components/PrintBar';

type SP = Promise<{ tab?: string; p?: string }>;
const TABS: [string, string][] = [['overview', 'Overview'], ['sales', 'Sales'], ['customers', 'Customers'], ['destinations', 'Destinations'], ['suppliers', 'Suppliers and products'], ['crm', 'Pipeline']];
const SHOW: Record<string, string[]> = { overview: [], sales: ['monthly', 'channel', 'service', 'staff'], customers: ['customers'], destinations: ['destinations'], suppliers: ['suppliers', 'products'], crm: ['pipeline', 'requests'] };

function fmt(v: string | number, kind?: string) {
  if (kind === 'money') return money(Number(v));
  if (kind === 'pct') return `${Number(v).toFixed(1)}%`;
  return String(v);
}
function ReportTable({ t, href }: { t: Table; href: string }) {
  return (
    <section className="sheet rep" style={{ marginBottom: 16 }}>
      <div className="cp" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>{t.title}</h2><div className="cp-actions noprint"><a className="btn" href={href}>Export to Excel (CSV)</a></div></div>
      {t.rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing in this period.</p> : (
        <div className="table-wrap"><table>
          <thead><tr>{t.cols.map((c, i) => <th key={i} className={c.kind ? 'num' : ''}>{c.h}</th>)}</tr></thead>
          <tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={t.cols[j].kind ? 'num' : ''}>{j === 0 ? <strong>{v}</strong> : fmt(v, t.cols[j].kind)}</td>)}</tr>)}</tbody>
          {t.total && <tfoot><tr>{t.total.map((v, j) => <td key={j} className={t.cols[j].kind ? 'num' : ''}><b>{fmt(v, t.cols[j].kind)}</b></td>)}</tr></tfoot>}
        </table></div>
      )}
      {t.note && <p className="hint">{t.note}</p>}
    </section>
  );
}

/** Monthly sales and margin as bars. The same figures are in the Sales tab as a table. */
function Chart({ t }: { t: Table }) {
  const W = 720, H = 220, pad = 34, n = t.rows.length;
  const max = Math.max(1, ...t.rows.map((r) => Number(r[2])));
  const bw = (W - pad * 2) / Math.max(n, 1);
  const y = (v: number) => H - 26 - (v / max) * (H - 50);
  const summary = t.rows.map((r) => `${r[0]}: sales ${money(Number(r[2]))}, margin ${money(Number(r[4]))}`).join('; ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="repchart" role="img" aria-label={`Sales and margin by month. ${summary}`}>
      <line x1={pad} x2={W - pad} y1={H - 26} y2={H - 26} className="axis" />
      <text x={pad} y={14} className="lab">{money(max)}</text>
      {t.rows.map((r, i) => {
        const x = pad + i * bw, s = Number(r[2]), m = Math.max(0, Number(r[4]));
        return (
          <g key={i}>
            <rect x={x + bw * 0.14} y={y(s)} width={bw * 0.36} height={H - 26 - y(s)} className="bar-s" rx={3}><title>{`${r[0]}: sales ${money(s)}`}</title></rect>
            <rect x={x + bw * 0.52} y={y(m)} width={bw * 0.32} height={H - 26 - y(m)} className="bar-m" rx={3}><title>{`${r[0]}: margin ${money(m)}`}</title></rect>
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="lab">{String(r[0]).split(' ')[0]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const today = todayISO();
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'overview';
  const p = sp.p || '12m';
  const per = reportPeriod(p, today);
  const [sales, crm] = await Promise.all([salesIn(per.from, per.to), crmIn(per.from, per.to)]);
  const tables = await reportTables(sales, per.months, crm);
  const link = (o: Record<string, string>) => `/reports?${new URLSearchParams({ tab, p, ...o })}`;
  const yr = /^\d{4}/.test(p) ? p.slice(0, 4) : today.slice(0, 4);
  const price = r2(sales.reduce((s, x) => s + x.price, 0)), cost = r2(sales.reduce((s, x) => s + x.cost, 0)), margin = r2(price - cost);
  const won = crm.leads.filter((l) => l.stage === 'won').length, lost = crm.leads.filter((l) => l.stage === 'lost').length;
  const exp = (r: string) => `/api/reports/export?${new URLSearchParams({ r, p })}`;
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Reports</h1></div>
        <div className="cp-actions noprint"><PrintButton /></div>
        <Tabs base="/reports" current={tab} items={TABS} />
        <div className="cp-tools noprint">
          <div className="chips">
            <Link className={`chip ${p === '12m' ? 'on' : ''}`} href={link({ p: '12m' })}>Last 12 months</Link>
            <Link className="chip" href={link({ p: String(Number(yr) - 1) })} aria-label="Previous year">‹</Link>
            <Link className={`chip ${p === yr ? 'on' : ''}`} href={link({ p: yr })}>Year {yr}</Link>
            {[1, 2, 3, 4].map((q) => <Link key={q} className={`chip ${p === `${yr}-Q${q}` ? 'on' : ''}`} href={link({ p: `${yr}-Q${q}` })}>Q{q}</Link>)}
            <Link className="chip" href={link({ p: String(Number(yr) + 1) })} aria-label="Next year">›</Link>
          </div>
          <form className="chips" action="/reports">
            <input type="hidden" name="tab" value={tab} />
            <label className="sr" htmlFor="rep-m">Month</label>
            <select id="rep-m" name="p" defaultValue={/^\d{4}-\d{2}$/.test(p) ? p : ''}>
              <option value="" disabled>Choose a month</option>
              {Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, '0')}`).map((m) => <option key={m} value={m}>{new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</option>)}
            </select>
            <button className="btn">Show</button>
          </form>
        </div>
      </div>
      <p className="muted" style={{ margin: '0 0 12px' }}><b>{per.label}</b>: confirmed bookings by booking date, prices before VAT.</p>
      {tab === 'overview' && (
        <>
          <div className="kpis">
            <div className="kpi"><span>Sales</span><b>{money(price)}</b></div>
            <div className="kpi"><span>Margin</span><b>{money(margin)}</b><span className="muted">{price ? `${((margin / price) * 100).toFixed(1)}% of sales` : ''}</span></div>
            <div className="kpi"><span>Bookings</span><b>{sales.length}</b><span className="muted">{sales.length ? `${money(price / sales.length)} on average` : ''}</span></div>
            <div className="kpi"><span>Win rate</span><b>{won + lost ? `${Math.round((won / (won + lost)) * 100)}%` : 'None decided'}</b><span className="muted">{won} won, {lost} lost</span></div>
          </div>
          <section className="sheet" style={{ marginBottom: 16 }}>
            <div className="cp" style={{ marginBottom: 6 }}><h2 style={{ margin: 0 }}>Sales and margin by month</h2>
              <span className="legend"><i className="sw s" /> Sales <i className="sw m" /> Margin</span></div>
            <Chart t={tables.monthly} />
          </section>
          <div className="rgrid">
            {(['customers', 'destinations'] as const).map((k) => (
              <section key={k} className="sheet">
                <div className="cp" style={{ marginBottom: 6 }}><h2 style={{ margin: 0 }}>{tables[k].title}</h2><Link className="btn noprint" href={link({ tab: k })}>See all</Link></div>
                {tables[k].rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing in this period.</p> : (
                  <table className="lines"><tbody>{tables[k].rows.slice(0, 5).map((r, i) => <tr key={i}><td>{r[0]}</td><td className="num">{money(Number(r[k === 'customers' ? 3 : 2]))}</td></tr>)}</tbody></table>
                )}
              </section>
            ))}
          </div>
        </>
      )}
      {SHOW[tab].map((k) => <ReportTable key={k} t={tables[k]} href={exp(k)} />)}
    </>
  );
}
