import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getFinance, getPurchase } from '@/lib/finance';
import { getCompany, getContact } from '@/lib/queries';
import { PAY_METHODS, docTotals, fmtDate, label, money } from '@/lib/constants';
import { PaperHead, PaperFoot } from '@/lib/paper';
import { PrintBar } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';

export default async function PrintVoucher({ params }: { params: Promise<{ id: string; pid: string }> }) {
  if (!(await getSession())) redirect('/login');
  const { id, pid } = await params;
  const po = await getPurchase(id);
  const idx = po ? po.payments.findIndex((p) => p.id === pid) : -1;
  if (!po || idx < 0) notFound();
  const x = po.payments[idx];
  const [company, supplier, fin] = await Promise.all([getCompany(), getContact(po.supplierId), getFinance()]);
  const after = docTotals(po.lines, po.payments.slice(0, idx + 1)).balance;
  return (
    <div className="printpage">
      <PrintBar back={`/purchasing/${po.id}`} backLabel="Back to the order" />
      <article className="paper">
        <PaperHead company={company} title="Payment voucher" number={x.ref} party={supplier} partyLabel="Paid to"
          meta={[['Date', fmtDate(x.date)], ['Method', label(PAY_METHODS, x.method)], ['Paid from', fin.accounts.find((a) => a.id === x.accountId)?.name ?? ''], ['Supplier bill', po.billRef]]} />
        <div className="amountbox"><span className="lbl">Amount paid</span><div className="big">{money(x.amount)}</div></div>
        <table><tbody>
          <tr><td>For purchase order</td><td className="r">{po.ref}</td></tr>
          <tr><td>Bill total</td><td className="r">{money(docTotals(po.lines).total)}</td></tr>
          <tr><td>Still owed after this payment</td><td className="r"><b>{money(after)}</b></td></tr>
        </tbody></table>
        <PaperFoot company={company} sigs={['Prepared by', 'Received by supplier']} />
      </article>
    </div>
  );
}
