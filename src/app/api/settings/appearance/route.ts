import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { getAppearance } from '@/lib/branding';
import { PRESETS } from '@/lib/constants';

const schema = z.object({
  preset: z.string().refine((p) => p in PRESETS, 'Choose a colour preset.'),
  mode: z.enum(['system', 'light', 'dark']), font: z.enum(['instrument', 'system', 'serif']),
  density: z.enum(['comfortable', 'compact']), corners: z.enum(['rounded', 'square']), showLogo: z.boolean(),
});
/** One look for the whole team and the portal. */
export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'appearance' }, { $set: schema.parse(await req.json()) }, { upsert: true });
    return getAppearance();
  });
}
