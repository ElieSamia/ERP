import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalCtx } from '@/lib/portal';
import { listInvoices } from '@/lib/finance';
import { docTotals, fmtDate, money, todayISO } from '@/lib/constants';

export default async function PortalInvoices() {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  if (ctx.perms.invoices !== 'yes') return <div className="empty">Your access doesn’t include invoices. Ask your account admin.</div>;
  const today = todayISO();
  const list = (await listInvoices({})).filter((i) => i.contactId === ctx.contactId && i.status !== 'draft');
  const open = list.filter((i) => i.status === 'posted');
  const due = open.reduce((s, i) => s + docTotals(i.lines, i.payments).balance, 0);
  const late = open.filter((i) => i.dueDate < today);
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Invoices</h1></div>
        {ctx.perms.statement === 'yes' && <div className="cp-actions"><Link className="btn" href="/portal/statement">Statement of account</Link></div>}</div>
      <div className="kpis">
        <div className="kpi"><span>Balance due</span><b>{money(due)}</b></div>
        <div className="kpi"><span>Overdue</span><b>{money(late.reduce((s, i) => s + docTotals(i.lines, i.payments).balance, 0))}</b>{late.length > 0 && <span className="late-t">{late.length} invoice{late.length === 1 ? '' : 's'}</span>}</div>
        <div className="kpi"><span>Invoices</span><b>{list.length}</b></div>
      </div>
      {list.length === 0 ? <div className="empty">No invoices yet.</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Invoice</th><th>Booking</th><th>Date</th><th>Due</th><th>Status</th><th className="num">Total</th><th className="num">Balance</th></tr></thead>
          <tbody>{list.map((i) => { const t = docTotals(i.lines, i.payments); const overdue = i.status === 'posted' && i.dueDate < today; return (
            <tr key={i.id}><td><Link href={`/portal/invoices/${i.id}`}><strong>{i.number}</strong></Link></td><td>{i.bookingRef ?? ''}</td>
              <td>{fmtDate(i.date)}</td><td className={overdue ? 'overdue' : ''}>{fmtDate(i.dueDate)}</td>
              <td>{i.status === 'paid' ? <span className="badge b-green">Paid</span> : overdue ? <span className="badge b-red">Overdue</span> : <span className="badge b-amber">Open</span>}</td>
              <td className="num">{money(t.total)}</td><td className="num"><b>{money(t.balance)}</b></td></tr>); })}
          </tbody></table></div>
      )}
      <p className="hint">To pay, use the bank details on the invoice and quote its number. Payments appear here once we record them.</p>
    </>
  );
}
