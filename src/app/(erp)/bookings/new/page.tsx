import { getPricing, listSuppliers } from '@/lib/bookings';
import { BookingForm } from '@/components/BookingForm';

export default async function NewBooking() {
  const [suppliers, pricing] = await Promise.all([listSuppliers(), getPricing()]);
  return <BookingForm suppliers={suppliers} pricing={pricing} />;
}
