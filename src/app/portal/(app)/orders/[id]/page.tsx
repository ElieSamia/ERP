import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPortalCtx, supplierDocs, supplierOrder } from '@/lib/portal';
import { getBooking } from '@/lib/bookings';
import { ORDER_LABEL, SERVICE_TYPES, docTotals, fmtDate, label, money, r2, travList, travelDates } from '@/lib/constants';
import { SupplierOrder } from '@/components/SupplierOrder';

/** One purchase order as the supplier sees it: what we ordered from them, never our selling prices. */
export default async function SupplierOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  const po = await supplierOrder(ctx, (await params).id);
  if (!po) notFound();
  const b = po.bookingId ? await getBooking(po.bookingId) : null;
  const t = docTotals(po.lines, po.payments);
  const [st, badge] = ORDER_LABEL(po);
  return (
    <>
      <div className="cp">
        <div className="crumbs"><Link className="crumb" href="/portal/orders">Purchase orders</Link><span className="sep">/</span><span>{po.ref}</span></div>
        <div className="cp-actions"><Link className="btn" href={`/portal/print/po/${po.id}`} target="_blank">Print order</Link></div>
        <div className="cp-tools"><span className={`badge ${badge}`}>{st}</span></div>
      </div>
      <section className="sheet" style={{ marginBottom: 16 }}>
        <div className="grid">
          <div className="fld"><span>Order date</span><div className="ro">{fmtDate(po.orderDate)}</div></div>
          {b && <div className="fld"><span>Our file</span><div className="ro">{b.ref}</div></div>}
          {b && <div className="fld"><span>Travel dates</span><div className="ro">{travelDates(b) || 'Not set'}</div></div>}
          {b && <div className="fld"><span>Guests or passengers</span><div className="ro">{travList(b.travellers).join(', ') || 'To be confirmed'}</div></div>}
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}><table className="lines">
          <thead><tr><th>Service</th><th>Description</th><th>VAT</th><th className="num">Amount</th></tr></thead>
          <tbody>{po.lines.map((l) => <tr key={l.id}><td>{label(SERVICE_TYPES, l.type ?? 'other')}</td><td className="pre">{l.desc}</td><td>{l.vat}%</td><td className="num">{money(l.amount)}</td></tr>)}</tbody>
        </table></div>
        <div className="totals">
          <div><span>Untaxed amount</span><b>{money(t.untaxed)}</b></div><div><span>VAT</span><b>{money(t.vat)}</b></div>
          <div className="grand"><span>Total</span><b>{money(t.total)}</b></div>
          {t.paid > 0 && <><div><span>Paid</span><b>{money(t.paid)}</b></div><div className="grand"><span>Still owed</span><b>{money(r2(t.balance))}</b></div></>}
        </div>
        {po.notes && <p className="pre" style={{ marginBottom: 0 }}>{po.notes}</p>}
      </section>
      <SupplierOrder initial={{ id: po.id, ref: po.ref, status: po.status, supplierAck: po.supplierAck, thread: po.thread, supplierBill: po.supplierBill, docs: supplierDocs(po.docs), total: t.total }}
        canRespond={ctx.perms.orders === 'respond'} canBill={ctx.perms.bills === 'upload'} />
    </>
  );
}
