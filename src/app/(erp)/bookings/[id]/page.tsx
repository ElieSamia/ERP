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
  return <BookingForm key={b.id} initial={b} suppliers={suppliers} pricing={pricing} pax={raw ? paxFor(raw) : []} />;
}
