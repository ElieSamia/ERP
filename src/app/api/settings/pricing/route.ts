import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { pricingSchema } from '@/lib/schemas';
import { getPricing } from '@/lib/bookings';

export async function GET() {
  return handle(async () => {
    await requireUser();
    return getPricing();
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const data = pricingSchema.parse(await req.json());
    await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'pricing' }, { $set: data }, { upsert: true });
    return getPricing();
  });
}
