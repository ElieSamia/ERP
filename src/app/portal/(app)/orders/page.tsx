import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalCtx, supplierOrders } from '@/lib/portal';
import { ORDER_LABEL, docTotals, fmtDate, money } from '@/lib/constants';

export default async function SupplierOrders() {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  if (ctx.side !== 'supplier' || !ctx.perms.orders || ctx.perms.orders === 'none') return <div className="empty">Your access doesn’t include orders. Ask your account admin.</div>;
  const list = await supplierOrders(ctx);
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Purchase orders</h1></div></div>
      {list.length === 0 ? <div className="empty">No orders yet. Orders appear here as soon as we confirm them to you.</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Order</th><th>Our file</th><th>Order date</th><th>Your reference</th><th>Status</th><th className="num">Total</th></tr></thead>
          <tbody>{list.map((p) => { const [l, b] = ORDER_LABEL(p); return (
            <tr key={p.id}><td><Link href={`/portal/orders/${p.id}`}><strong>{p.ref}</strong></Link></td><td>{p.bookingRef ?? ''}</td><td>{fmtDate(p.orderDate)}</td>
              <td>{p.supplierAck?.ref ?? ''}</td><td><span className={`badge ${b}`}>{l}</span></td><td className="num">{money(docTotals(p.lines).total)}</td></tr>); })}
          </tbody></table></div>
      )}
    </>
  );
}
