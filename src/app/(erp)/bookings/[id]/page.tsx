import { passportIssues } from '@/lib/passports';
import { getSession } from '@/lib/auth';
import { accessFor } from '@/lib/roles';
import { maskBooking } from '@/lib/costmask';
import { notFound } from 'next/navigation';
import { getBooking, getPricing, listSuppliers } from '@/lib/bookings';
import { BookingForm } from '@/components/BookingForm';
import { db } from '@/lib/db';
import { paxFor } from '@/lib/travellers';
import { ObjectId } from 'mongodb';

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const [b, suppliers, pricing] = await Promise.all([getBooking((await params).id), listSuppliers(), getPricing()]);
  if (!b) notFound();
  const raw = await (await db()).collection('bookings').findOne({ _id: new ObjectId(b.id) });
  const me = await getSession();
  const costs = me ? (await accessFor(me.sub, me.role)).costs : false;
  const issues = raw ? passportIssues(raw) : [];
  return (
    <>
      {issues.length > 0 && <div className={`banner ${issues.some((i) => i.level === 'expired') ? 'err' : ''}`} role="status" style={{ display: 'block', marginBottom: 12 }}>
        <b>Passports to check</b>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{issues.map((i) => <li key={i.name + i.level}>{i.text}</li>)}</ul>
        <small>Most countries require a passport valid at least six months after the return. Update the details under Travellers.</small>
      </div>}
      <BookingForm key={b.id} initial={costs ? b : maskBooking(b)} suppliers={suppliers} pricing={pricing} pax={raw ? paxFor(raw) : []} costs={costs} />
    </>
  );
}
