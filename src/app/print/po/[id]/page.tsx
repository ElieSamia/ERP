import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getPurchase } from '@/lib/finance';
import { getBooking } from '@/lib/bookings';
import { getCompany, getContact } from '@/lib/queries';
import { SERVICE_TYPES, docTotals, fmtDate, label, money, travList, travelDates } from '@/lib/constants';
import { PaperHead, PaperFoot } from '@/lib/paper';
import { PrintBar } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';

export default async function PrintPO({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) redirect('/login');
  const po = await getPurchase((await params).id);
  if (!po) notFound();
  const [company, supplier, booking] = await Promise.all([getCompany(), getContact(po.supplierId), po.bookingId ? getBooking(po.bookingId) : Promise.resolve(null)]);
  const t = docTotals(po.lines);
  const stamp = po.status === 'draft' ? 'Request for quotation' : po.status === 'cancelled' ? 'Cancelled' : undefined;
  return (
    <div className="printpage">
      <PrintBar back={`/purchasing/${po.id}`} backLabel="Back to the order" />
      <article className="paper">
        <PaperHead company={company} title="Purchase order" number={po.ref} party={supplier} partyLabel="Supplier" showTax stamp={stamp}
          meta={[['Order date', fmtDate(po.orderDate)], ['Our reference', booking?.ref ?? ''], ['Travel dates', booking ? travelDates(booking) : '']]} />
        {booking && travList(booking.travellers).length > 0 && <><h3>Travellers</h3><p>{travList(booking.travellers).map((x) => <span key={x}>{x}<br /></span>)}</p></>}
        <table>
          <thead><tr><th>Service</th><th>Description</th><th>VAT</th><th className="r">Amount</th></tr></thead>
          <tbody>{po.lines.map((l) => <tr key={l.id}><td>{label(SERVICE_TYPES, l.type)}</td><td>{l.desc}</td><td>{l.vat}%</td><td className="r">{money(l.amount)}</td></tr>)}</tbody>
        </table>
        <div className="tot"><div><span>Untaxed amount</span><span>{money(t.untaxed)}</span></div><div><span>VAT</span><span>{money(t.vat)}</span></div><div className="g"><span>Total</span><span>{money(t.total)}</span></div></div>
        {po.notes && <p className="pre">{po.notes}</p>}
        <PaperFoot company={company} note="Please quote the purchase order number on your invoice." sigs={['Authorised by', 'Accepted by supplier']} />
      </article>
    </div>
  );
}
