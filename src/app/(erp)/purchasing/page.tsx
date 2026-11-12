import Link from 'next/link';
import { listPurchases, getFinance } from '@/lib/finance';
import { PO_STATES, PO_BADGE, PAY_METHODS, addDays, docTotals, fmtDate, label, money, todayISO } from '@/lib/constants';
import { SearchBox } from '@/components/SearchBox';
import { FilterChips, Tabs } from '@/components/ListChrome';

type SP = Promise<{ q?: string; status?: string; tab?: string }>;

export default async function PurchasingPage({ searchParams }: { searchParams: SP }) {
  const { q, status = 'all', tab = 'orders' } = await searchParams;
  const [rows, fin] = await Promise.all([listPurchases({ q, status: tab === 'payments' ? undefined : status }), getFinance()]);
  const today = todayISO();
  const pays = rows.flatMap((p) => p.payments.map((x) => ({ p, x }))).sort((a, b) => b.x.date.localeCompare(a.x.date));
  return (
    <>
      <div className="cp">
        <div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Purchasing</h1></div>
        <div className="cp-actions"><Link className="btn primary" href="/purchasing/new">New request for quotation</Link></div>
        <Tabs base="/purchasing" current={tab} items={[['orders', 'Purchase orders'], ['payments', 'Payments made']]} />
        <div className="cp-tools">
          <SearchBox placeholder="Search order, supplier or bill number" />
          {tab !== 'payments' && <FilterChips base="/purchasing" current={status} q={q} items={PO_STATES} />}
        </div>
      </div>
      {tab === 'payments' ? (
        pays.length === 0 ? <div className="empty">No supplier payments yet. Record one from a billed purchase order.</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Voucher</th><th>Supplier</th><th>Order</th><th>Method</th><th>Paid from</th><th className="num">Amount</th><th><span className="sr">Print</span></th></tr></thead>
            <tbody>{pays.map(({ p, x }) => (
              <tr key={x.id}><td>{fmtDate(x.date)}</td><td><strong>{x.ref}</strong></td><td>{p.supplierName}</td><td><Link href={`/purchasing/${p.id}`}>{p.ref}</Link></td>
                <td>{label(PAY_METHODS, x.method)}</td><td>{fin.accounts.find((a) => a.id === x.accountId)?.name ?? x.accountId}</td><td className="num">{money(x.amount)}</td>
                <td style={{ textAlign: 'right' }}><a className="btn" href={`/print/voucher/${p.id}/${x.id}`} target="_blank" rel="noopener">Print voucher</a></td></tr>))}
            </tbody></table></div>
        )
      ) : rows.length === 0 ? <div className="empty">{q || status !== 'all' ? 'No orders match this search or filter.' : 'No purchase orders yet. They’re created when you confirm a booking with suppliers, or with New request for quotation.'}</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Order</th><th>Supplier</th><th>Booking</th><th>Order date</th><th>Bill due</th><th>Status</th><th className="num">Total</th><th className="num">Owed</th></tr></thead>
          <tbody>{rows.map((p) => { const t = docTotals(p.lines, p.payments); const due = p.billDate ? addDays(p.billDate, fin.supplierTerms) : ''; const late = p.status === 'billed' && due && due < today; return (
            <tr key={p.id}><td><Link href={`/purchasing/${p.id}`}><strong>{p.ref}</strong></Link></td><td>{p.supplierName}</td>
              <td>{p.bookingId ? <Link href={`/bookings/${p.bookingId}`}>{p.bookingRef}</Link> : ''}</td><td>{fmtDate(p.orderDate)}</td>
              <td className={late ? 'overdue' : ''}>{due ? fmtDate(due) : ''}</td><td><span className={`badge ${PO_BADGE[p.status]}`}>{label(PO_STATES, p.status)}</span></td>
              <td className="num">{money(t.total)}</td><td className="num">{['billed', 'paid'].includes(p.status) ? money(t.balance) : ''}</td></tr>); })}
          </tbody></table></div>
      )}
    </>
  );
}
