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
  return <BookingForm key={b.id} initial={costs ? b : maskBooking(b)} suppliers={suppliers} pricing={pricing} pax={raw ? paxFor(raw) : []} costs={costs} />;
}
