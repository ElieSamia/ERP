import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { cancelLine, reserveLine } from '@/lib/rates';
import { getBooking } from '@/lib/bookings';

const schema = z.object({ lineId: z.string(), action: z.enum(['reserve', 'cancel']), acceptPrice: z.number().nullable().default(null) });

/** Reserve a service with its provider (after re-checking the price), or cancel that reservation. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const b = schema.parse(await req.json());
    if (b.action === 'reserve') await reserveLine(id, b.lineId, b.acceptPrice, user.name);
    else await cancelLine(id, b.lineId, user.name);
    return getBooking(id);
  });
}
