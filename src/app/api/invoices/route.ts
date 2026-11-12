import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { getInvoice, invoiceFromBooking, listInvoices } from '@/lib/finance';

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    const p = new URL(req.url).searchParams;
    return listInvoices({ q: p.get('q')?.trim() || undefined, status: p.get('status') || undefined });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { bookingId } = z.object({ bookingId: z.string().min(1) }).parse(await req.json());
    return getInvoice(await invoiceFromBooking(bookingId, user.name));
  });
}
