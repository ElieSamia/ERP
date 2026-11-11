import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { getSession } from '@/lib/auth';
import { getBooking } from '@/lib/bookings';
import { getCompany, getContact } from '@/lib/queries';
import { fmtDate, nights, travList } from '@/lib/constants';
import { PaperHead, PaperFoot } from '@/lib/paper';
import { PrintBar } from '@/components/PrintBar';

export const dynamic = 'force-dynamic';

/** One hotel voucher page per hotel or package service. Vouchers never show prices. */
export default async function PrintVouchers({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) redirect('/login');
  const { id } = await params;
  const b = await getBooking(id);
  if (!b) notFound();
  const company = await getCompany();
  const hotels = b.lines.filter((l) => l.type === 'hotel' || l.type === 'package');
  const providers = await Promise.all(hotels.map((l) => (ObjectId.isValid(l.supplierId) ? getContact(l.supplierId) : Promise.resolve(null))));
  const trav = travList(b.travellers);
  const stamp = b.status === 'draft' ? 'Draft, not confirmed' : b.status === 'cancelled' ? 'Cancelled' : undefined;
  return (
    <div className="printpage">
      <PrintBar back={`/bookings/${id}`} />
      <article className="paper">
        {hotels.length === 0 && <p>This booking has no hotel or package services, so there is no voucher to print.</p>}
        {hotels.map((l, i) => (
          <section key={l.id} className="vpage">
            <PaperHead company={company} title="Hotel voucher" number={`${b.ref}/${i + 1}`} party={providers[i]} partyLabel="Service provider"
              meta={[['Booking', b.ref], ['Check-in', l.date ? fmtDate(l.date) : 'To be confirmed'], ['Check-out', l.dateTo ? fmtDate(l.dateTo) : 'To be confirmed'], ['Nights', String(nights(l.date, l.dateTo) || '')]]} stamp={stamp} />
            <h3>Guests</h3>
            <p>{trav.length ? trav.map((t) => <span key={t}>{t}<br /></span>) : 'To be confirmed'}</p>
            <h3>Accommodation and services</h3>
            <p className="pre">{l.desc}</p>
            <p className="small">Booked for {b.contactName}.</p>
            <PaperFoot company={company} note="Please present this voucher at check-in. Extras not listed are payable directly to the hotel." sigs={['Issued by', 'Hotel stamp']} />
          </section>
        ))}
      </article>
    </div>
  );
}
