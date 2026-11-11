import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getBooking } from '@/lib/bookings';
import { getCompany, getContact } from '@/lib/queries';
import { SERVICE_TYPES, fmtDate, fmtRange, label, money, sell, totals, travList, travelDates } from '@/lib/constants';
import { PaperHead, PaperFoot } from '@/lib/paper';
import { PrintBar } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';

/** Booking confirmation. Prices are hidden unless ?prices=1, since prices belong on the invoice. */
export default async function PrintBooking({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ prices?: string }> }) {
  if (!(await getSession())) redirect('/login');
  const { id } = await params;
  const prices = (await searchParams).prices === '1';
  const b = await getBooking(id);
  if (!b) notFound();
  const [company, contact] = await Promise.all([getCompany(), getContact(b.contactId)]);
  const meta: [string, string][] = [['Booking date', fmtDate(b.bookingDate)], ['Travel dates', travelDates(b)]];
  if (b.tripType !== 'service') meta.push(['Route', `${b.origin} to ${b.destination}${b.tripType === 'oneway' ? ', one way' : ''}`]);
  if (b.destinationName) meta.push(['Destination', b.destinationName]);
  const stamp = b.status === 'draft' ? 'Draft, not confirmed' : b.status === 'cancelled' ? 'Cancelled' : undefined;
  const trav = travList(b.travellers);
  return (
    <div className="printpage">
      <PrintBar back={`/bookings/${id}`} toggle={{ href: `/print/booking/${id}${prices ? '' : '?prices=1'}`, label: prices ? 'Hide prices' : 'Show prices' }} />
      <article className="paper">
        <PaperHead company={company} title="Booking confirmation" number={b.ref} party={contact} partyLabel="Customer" meta={meta} stamp={stamp} />
        <h3>Travellers</h3>
        <p>{trav.length ? trav.map((t) => <span key={t}>{t}<br /></span>) : 'To be confirmed'}</p>
        <table>
          <thead><tr><th>Service</th><th>Details</th><th>Dates</th>{prices && <th className="r">Price</th>}</tr></thead>
          <tbody>{b.lines.map((l) => <tr key={l.id}><td>{label(SERVICE_TYPES, l.type)}</td><td>{l.desc}</td><td>{fmtRange(l.date, l.dateTo)}</td>{prices && <td className="r">{money(sell(l))}</td>}</tr>)}</tbody>
        </table>
        {prices && <div className="tot"><div className="g"><span>Total</span><span>{money(totals(b.lines).total)}</span></div></div>}
        {b.tripNotes && <><h3>Important information</h3><p className="pre">{b.tripNotes}</p></>}
        <PaperFoot company={company} note="Please check names and dates against passports and tell us about any difference right away." />
      </article>
    </div>
  );
}
