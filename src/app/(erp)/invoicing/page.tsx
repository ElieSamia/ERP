import Link from 'next/link';
import { listInvoices, getFinance } from '@/lib/finance';
import { INVOICE_STATES, INV_BADGE, PAY_METHODS, docTotals, fmtDate, label, money, todayISO } from '@/lib/constants';
import { SearchBox } from '@/components/SearchBox';
import { FilterChips, Tabs } from '@/components/ListChrome';
import { listCredits } from '@/lib/credits';
import { contactNames } from '@/lib/accounting';

type SP = Promise<{ q?: string; status?: string; tab?: string }>;

export default async function InvoicingPage({ searchParams }: { searchParams: SP }) {
  const { q, status = 'all', tab = 'invoices' } = await searchParams;
  const [rows, fin] = await Promise.all([listInvoices({ q, status: tab === 'payments' ? undefined : status }), getFinance()]);
  const today = todayISO();
  const pays = rows.flatMap((i) => i.payments.filter((p) => p.method !== 'credit').map((p) => ({ i, p }))).sort((a, b) => b.p.date.localeCompare(a.p.date));
  const credits = tab === 'credits' ? await listCredits({ side: 'customer' }) : [];
  const names: Record<string, string> = tab === 'credits' ? Object.fromEntries((await contactNames()).map((c) => [c.id, c.name])) : {};
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Invoicing</h1></div>
        <div className="cp-actions"><Link className="btn" href="/bookings?status=ticketed">Invoice a booking</Link></div>
        <Tabs base="/invoicing" current={tab} items={[['invoices', 'Invoices'], ['payments', 'Payments received'], ['credits', 'Credit notes and refunds']]} />
        <div className="cp-tools">
          <SearchBox placeholder="Search invoice number or customer" />
          {tab === 'invoices' && <FilterChips base="/invoicing" current={status} q={q} items={INVOICE_STATES} />}
        </div>
      </div>
      {tab === 'credits' ? (
        credits.length === 0 ? <div className="empty">No credit notes yet. Create one from a posted invoice when a trip is cancelled or changed.</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Credit note</th><th>Date</th><th>Customer</th><th>For invoice</th><th>Reason</th><th className="num">Total</th><th className="num">Refunded</th><th className="num">Still available</th></tr></thead>
            <tbody>{credits.map((c) => (
              <tr key={c.id}><td><a href={`/print/credit/${c.id}`} target="_blank" rel="noopener"><strong>{c.number}</strong></a></td><td>{fmtDate(c.date)}</td><td>{names[c.partnerId] ?? ''}</td>
                <td><Link href={`/invoicing/${c.docId}`}>{c.docRef}</Link></td><td>{c.reason}</td><td className="num">{money(c.total, c.currency)}</td><td className="num">{c.refunded ? money(c.refunded, c.currency) : ''}</td><td className="num">{c.available > 0.004 ? money(c.available, c.currency) : ''}</td></tr>))}
            </tbody></table></div>
        )
      ) : tab === 'payments' ? (
        pays.length === 0 ? <div className="empty">No customer payments yet. Record one from a posted invoice.</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Receipt</th><th>Customer</th><th>Invoice</th><th>Method</th><th>Account</th><th className="num">Amount</th><th><span className="sr">Print</span></th></tr></thead>
            <tbody>{pays.map(({ i, p }) => (
              <tr key={p.id}><td>{fmtDate(p.date)}</td><td><strong>{p.ref}</strong></td><td>{i.contactName}</td><td><Link href={`/invoicing/${i.id}`}>{i.number}</Link></td>
                <td>{label(PAY_METHODS, p.method)}{p.cancelled && <span className="badge b-red" style={{ marginLeft: 6 }}>Cancelled</span>}</td><td>{fin.accounts.find((a) => a.id === p.accountId)?.name ?? p.accountId}</td><td className="num" style={p.cancelled ? { textDecoration: 'line-through' } : undefined}>{money(p.amount, i.currency)}</td>
                <td style={{ textAlign: 'right' }}><a className="btn" href={`/print/receipt/${i.id}/${p.id}`} target="_blank" rel="noopener">Print receipt</a></td></tr>))}
            </tbody></table></div>
        )
      ) : rows.length === 0 ? <div className="empty">{q || status !== 'all' ? 'No invoices match this search or filter.' : 'No invoices yet. Open a confirmed or ticketed booking and click Create invoice.'}</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Number</th><th>Customer</th><th>Booking</th><th>Date</th><th>Due</th><th>Status</th><th className="num">Total</th><th className="num">Balance</th></tr></thead>
          <tbody>{rows.map((i) => { const t = docTotals(i.lines, i.payments); const late = i.status === 'posted' && i.dueDate < today; return (
            <tr key={i.id}><td><Link href={`/invoicing/${i.id}`}><strong>{i.number ?? 'Draft'}</strong></Link></td><td>{i.contactName}</td>
              <td>{i.bookingId ? <Link href={`/bookings/${i.bookingId}`}>{i.bookingRef}</Link> : ''}</td><td>{fmtDate(i.date)}</td>
              <td className={late ? 'overdue' : ''}>{fmtDate(i.dueDate)}</td><td><span className={`badge ${late ? 'b-red' : INV_BADGE[i.status]}`}>{late ? 'Overdue' : label(INVOICE_STATES, i.status)}</span></td>
              <td className="num">{money(t.total, i.currency)}</td><td className="num">{i.status === 'draft' ? '' : money(t.balance, i.currency)}</td></tr>); })}
          </tbody></table></div>
      )}
    </>
  );
}
