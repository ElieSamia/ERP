import { notFound } from 'next/navigation';
import { getBooking, getPricing, listSuppliers } from '@/lib/bookings';
import { BookingForm } from '@/components/BookingForm';

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const [b, suppliers, pricing] = await Promise.all([getBooking((await params).id), listSuppliers(), getPricing()]);
  if (!b) notFound();
  return <BookingForm key={b.id} initial={b} suppliers={suppliers} pricing={pricing} />;
}
