import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPortalCtx } from '@/lib/portal';
import { getInvoice } from '@/lib/finance';
import { PAY_METHODS, docTotals, fmtDate, label, money, r2, todayISO } from '@/lib/constants';

export default async function PortalInvoice({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  if (ctx.perms.invoices !== 'yes') notFound();
  const inv = await getInvoice((await params).id);
  if (!inv || inv.contactId !== ctx.contactId || inv.status === 'draft') notFound();
  const t = docTotals(inv.lines, inv.payments);
  const overdue = inv.status === 'posted' && inv.dueDate < todayISO();
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/portal/invoices">Invoices</Link><span className="sep">/</span><span>{inv.number}</span></div>
        <div className="cp-actions"><Link className="btn primary" href={`/portal/print/invoice/${inv.id}`} target="_blank">Print or save as PDF</Link></div>
        <div className="cp-tools">{inv.status === 'paid' ? <span className="badge b-green">Paid</span> : overdue ? <span className="badge b-red">Overdue</span> : <span className="badge b-amber">Open</span>}</div>
      </div>
      <section className="sheet" style={{ marginBottom: 16 }}>
        <div className="grid">
          <div className="fld"><span>Invoice date</span><div className="ro">{fmtDate(inv.date)}</div></div>
          <div className="fld"><span>Due date</span><div className={`ro ${overdue ? 'overdue' : ''}`}>{fmtDate(inv.dueDate)}</div></div>
          {inv.bookingRef && <div className="fld"><span>Booking</span><div className="ro">{inv.bookingRef}</div></div>}
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}><table className="lines">
          <thead><tr><th>Description</th><th>VAT</th><th className="num">Amount</th><th className="num">VAT amount</th></tr></thead>
          <tbody>{inv.lines.map((l) => <tr key={l.id}><td>{l.desc}</td><td>{l.vat}%</td><td className="num">{money(l.amount)}</td><td className="num">{money(r2(l.amount * l.vat / 100))}</td></tr>)}</tbody>
        </table></div>
        <div className="totals">
          <div><span>Untaxed amount</span><b>{money(t.untaxed)}</b></div><div><span>VAT</span><b>{money(t.vat)}</b></div>
          <div className="grand"><span>Total</span><b>{money(t.total)}</b></div>
          {t.paid > 0 && <><div><span>Paid</span><b>{money(t.paid)}</b></div><div className="grand"><span>Balance due</span><b>{money(t.balance)}</b></div></>}
        </div>
      </section>
      <section className="sheet">
        <h2>Payments</h2>
        {inv.payments.length === 0 ? <p className="muted" style={{ margin: 0 }}>No payments recorded yet.</p> : (
          <div className="table-wrap"><table className="lines">
            <thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th className="num">Amount</th><th><span className="sr">Print</span></th></tr></thead>
            <tbody>{inv.payments.map((p) => <tr key={p.id}><td>{p.ref}</td><td>{fmtDate(p.date)}</td><td>{label(PAY_METHODS, p.method)}</td><td className="num">{money(p.amount)}</td>
              <td style={{ textAlign: 'right' }}><Link className="btn" href={`/portal/print/receipt/${inv.id}?pid=${p.id}`} target="_blank">Receipt</Link></td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
