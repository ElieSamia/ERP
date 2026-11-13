import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalCtx } from '@/lib/portal';
import { listPurchases } from '@/lib/finance';
import { PAY_METHODS, fmtDate, label, money } from '@/lib/constants';

export default async function SupplierPayments() {
  const ctx = await getPortalCtx();
  if (!ctx) redirect('/portal/login');
  if (ctx.side !== 'supplier' || ctx.perms.payments !== 'yes') return <div className="empty">Your access doesn’t include payments. Ask your account admin.</div>;
  const pos = (await listPurchases({})).filter((p) => p.supplierId === ctx.contactId);
  const rows = pos.flatMap((p) => p.payments.map((x) => ({ ...x, poId: p.id, poRef: p.ref, billRef: p.billRef }))).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="cp"><div className="crumbs"><h1 style={{ fontSize: 'inherit' }}>Payments</h1></div>
        {ctx.perms.statement === 'yes' && <div className="cp-actions"><Link className="btn" href="/portal/statement">Statement</Link></div>}</div>
      {rows.length === 0 ? <div className="empty">No payments yet.</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Voucher</th><th>Date</th><th>For order</th><th>Your bill</th><th>Method</th><th className="num">Amount</th><th><span className="sr">Print</span></th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.id}><td><strong>{x.ref}</strong></td><td>{fmtDate(x.date)}</td><td>{x.poRef}</td><td>{x.billRef}</td><td>{label(PAY_METHODS, x.method)}</td><td className="num">{money(x.amount)}</td>
              <td style={{ textAlign: 'right' }}><Link className="btn" href={`/portal/print/voucher/${x.poId}?pid=${x.id}`} target="_blank">Voucher</Link></td></tr>))}
          </tbody></table></div>
      )}
    </>
  );
}
