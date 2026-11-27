import { getSession } from '@/lib/auth';
import { accessFor } from '@/lib/roles';
import { getPricing, listSuppliers } from '@/lib/bookings';
import { BookingForm } from '@/components/BookingForm';

export default async function NewBooking() {
  const [suppliers, pricing] = await Promise.all([listSuppliers(), getPricing()]);
  const me = await getSession();
  const costs = me ? (await accessFor(me.sub, me.role)).costs : false;
  return <BookingForm suppliers={suppliers} pricing={pricing} costs={costs} />;
}
