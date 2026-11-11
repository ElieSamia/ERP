import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { companySchema } from '@/lib/schemas';
import { getCompany } from '@/lib/queries';

export async function GET() {
  return handle(async () => {
    await requireUser();
    return getCompany();
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const data = companySchema.parse(await req.json());
    await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'company' }, { $set: data }, { upsert: true });
    return getCompany();
  });
}
