import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getInvoice } from '@/lib/finance';
import { getCompany, getContact } from '@/lib/queries';
import { docTotals, fmtDate, money, r2 } from '@/lib/constants';
import { PaperHead, PaperFoot } from '@/lib/paper';
import { PrintBar } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';

export default async function PrintInvoice({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) redirect('/login');
  const inv = await getInvoice((await params).id);
  if (!inv) notFound();
  const [company, contact] = await Promise.all([getCompany(), getContact(inv.contactId)]);
  const t = docTotals(inv.lines, inv.payments);
  const stamp = inv.status === 'draft' ? 'Draft' : inv.status === 'paid' ? 'Paid' : undefined;
  return (
    <div className="printpage">
      <PrintBar back={`/invoicing/${inv.id}`} backLabel="Back to the invoice" />
      <article className="paper">
        <PaperHead company={company} title="Invoice" number={inv.number ?? 'Draft'} party={contact} partyLabel="Bill to" showTax stamp={stamp}
          meta={[['Invoice date', fmtDate(inv.date)], ['Due date', fmtDate(inv.dueDate)], ['Booking', inv.bookingRef ?? '']]} />
        <table>
          <thead><tr><th>Description</th><th>VAT</th><th className="r">Amount</th><th className="r">VAT amount</th></tr></thead>
          <tbody>{inv.lines.map((l) => <tr key={l.id}><td>{l.desc}</td><td>{l.vat}%</td><td className="r">{money(l.amount)}</td><td className="r">{money(r2(l.amount * l.vat / 100))}</td></tr>)}</tbody>
        </table>
        <div className="tot">
          <div><span>Untaxed amount</span><span>{money(t.untaxed)}</span></div>
          <div><span>VAT</span><span>{money(t.vat)}</span></div>
          <div className="g"><span>Total</span><span>{money(t.total)}</span></div>
          {t.paid > 0 && <><div><span>Paid</span><span>{money(t.paid)}</span></div><div><span><b>Balance due</b></span><span><b>{money(t.balance)}</b></span></div></>}
        </div>
        {inv.notes && <p className="pre">{inv.notes}</p>}
        <PaperFoot company={company} note="Thank you for travelling with us." />
      </article>
    </div>
  );
}
