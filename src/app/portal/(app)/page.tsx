import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalCtx, getPortalSettings, visibleBookings, visibleRequests } from '@/lib/portal';
import { listInvoices } from '@/lib/finance';
import { OPEN_REQ, docTotals, fmtDate, money, todayISO, travelDates } from '@/lib/constants';

export default async function PortalHome() {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  const p = ctx.perms;
  const [s, reqs, bks, invs] = await Promise.all([getPortalSettings(), visibleRequests(ctx), visibleBookings(ctx), p.invoices === 'yes' ? listInvoices({}) : Promise.resolve([])]);
  const today = todayISO();
  const mine = invs.filter((i) => i.contactId === ctx.contactId && i.status === 'posted');
  const due = mine.reduce((sum, i) => sum + docTotals(i.lines, i.payments).balance, 0);
  const late = mine.filter((i) => i.dueDate < today);
  const quotes = reqs.filter((r) => r.status === 'quoted' && p.acceptQuotes === 'yes');
  const approvals = reqs.filter((r) => r.status === 'approval' && p.approveQuotes === 'yes');
  const replies = reqs.filter((r) => OPEN_REQ.includes(r.status) && r.messages.at(-1)?.side === 'staff');
  const start = (b: (typeof bks)[number]) => b.departDate || b.lines.map((l) => l.date).filter(Boolean).sort()[0] || '';
  const upcoming = bks.filter((b) => b.status !== 'cancelled' && start(b) >= today).sort((a, b) => start(a).localeCompare(start(b)));
  const att = [
    ...approvals.map((r) => ({ href: `/portal/requests/${r.id}`, t: `Approval needed: ${r.title}`, s: `${r.ref}, accepted by ${r.approvalBy ?? 'a colleague'}` })),
    ...quotes.map((r) => ({ href: `/portal/requests/${r.id}`, t: `Quote ready: ${r.title}`, s: `${r.ref}, valid until ${fmtDate(r.quote?.validUntil)}` })),
    ...replies.map((r) => ({ href: `/portal/requests/${r.id}`, t: `New message on ${r.ref}`, s: r.title })),
    ...late.map((i) => ({ href: `/portal/invoices/${i.id}`, t: `Overdue invoice ${i.number}`, s: `${money(docTotals(i.lines, i.payments).balance)}, due ${fmtDate(i.dueDate)}` })),
  ];
  return (
    <>
      <section className="pwelcome">
        <div><h1>Welcome, {ctx.name.split(' ')[0]}</h1><p>{ctx.contactName}. {s.welcome}</p></div>
        <div className="cp-actions">{p.requests === 'create' && <Link className="btn primary" href="/portal/requests/new">New request</Link>}</div>
      </section>
      <div className="kpis">
        {p.requests !== 'none' && <div className="kpi"><span>Open requests</span><b>{reqs.filter((r) => OPEN_REQ.includes(r.status)).length}</b></div>}
        {p.bookings !== 'none' && <div className="kpi"><span>Upcoming trips</span><b>{upcoming.length}</b></div>}
        {p.invoices === 'yes' && <div className="kpi"><span>Balance due</span><b>{money(due)}</b>{late.length > 0 && <span className="late-t">{late.length} overdue</span>}</div>}
      </div>
      <div className="rgrid">
        <section className="sheet"><h2>Needs your attention</h2>
          {att.length ? <ul className="agenda">{att.map((a) => <li key={a.href + a.t}><Link className="ag" href={a.href}><i className="dot k-due" aria-hidden="true" /><span className="ag-time" /><span><b>{a.t}</b><span className="muted ag-sub">{a.s}</span></span></Link></li>)}</ul>
            : <p className="muted" style={{ margin: 0 }}>Nothing right now.</p>}
        </section>
        {p.bookings !== 'none' && <section className="sheet"><h2>Upcoming trips</h2>
          {upcoming.length ? <ul className="agenda">{upcoming.slice(0, 6).map((b) => <li key={b.id}><Link className="ag" href={`/portal/bookings/${b.id}`}><i className="dot k-flight" aria-hidden="true" /><span className="ag-time" /><span><b>{b.destinationName || b.ref}, {travelDates(b)}</b><span className="muted ag-sub">{b.ref}</span></span></Link></li>)}</ul>
            : <p className="muted" style={{ margin: 0 }}>No upcoming trips.</p>}
        </section>}
      </div>
    </>
  );
}
