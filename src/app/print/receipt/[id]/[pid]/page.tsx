import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getFinance, getInvoice } from '@/lib/finance';
import { getCompany, getContact } from '@/lib/queries';
import { PAY_METHODS, docTotals, fmtDate, label, money } from '@/lib/constants';
import { PaperHead, PaperFoot } from '@/lib/paper';
import { PrintBar } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';

export default async function PrintReceipt({ params }: { params: Promise<{ id: string; pid: string }> }) {
  if (!(await getSession())) redirect('/login');
  const { id, pid } = await params;
  const inv = await getInvoice(id);
  const idx = inv ? inv.payments.findIndex((p) => p.id === pid) : -1;
  if (!inv || idx < 0) notFound();
  const p = inv.payments[idx];
  const [company, contact, fin] = await Promise.all([getCompany(), getContact(inv.contactId), getFinance()]);
  const after = docTotals(inv.lines, inv.payments.slice(0, idx + 1)).balance;
  return (
    <div className="printpage">
      <PrintBar back={`/invoicing/${inv.id}`} backLabel="Back to the invoice" />
      <article className="paper">
        <PaperHead company={company} title="Payment receipt" number={p.ref} party={contact} partyLabel="Received from" showTax
          meta={[['Date', fmtDate(p.date)], ['Method', label(PAY_METHODS, p.method)], ['Received into', fin.accounts.find((a) => a.id === p.accountId)?.name ?? '']]} />
        <div className="amountbox"><span className="lbl">Amount received</span><div className="big">{money(p.amount)}</div></div>
        <table><tbody>
          <tr><td>For invoice</td><td className="r">{inv.number}</td></tr>
          <tr><td>Invoice total</td><td className="r">{money(docTotals(inv.lines).total)}</td></tr>
          <tr><td>Balance after this payment</td><td className="r"><b>{money(after)}</b></td></tr>
        </tbody></table>
        <PaperFoot company={company} note="Thank you for your payment." sigs={['Received by', 'Customer']} />
      </article>
    </div>
  );
}
