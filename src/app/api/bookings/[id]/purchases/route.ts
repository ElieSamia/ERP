import { handle, requireUser } from '@/lib/api';
import { purchasesFromBooking } from '@/lib/finance';
import { getBooking } from '@/lib/bookings';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const made = await purchasesFromBooking(id, user.name);
    return { made, booking: await getBooking(id) };
  });
}
