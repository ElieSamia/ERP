import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { getPortalSettings } from '@/lib/portal';

const schema = z.object({
  welcome: z.string().max(1000), payInstructions: z.string().max(2000), uploads: z.enum(['yes', 'no']), autoBook: z.enum(['yes', 'no']),
  quoteDays: z.coerce.number().int().min(1).max(90), response: z.string().max(120),
});
export async function GET() { return handle(async () => { await requireUser(); return getPortalSettings(); }); }
export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const data = schema.parse(await req.json());
    await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'portal' }, { $set: data }, { upsert: true });
    return getPortalSettings();
  });
}
