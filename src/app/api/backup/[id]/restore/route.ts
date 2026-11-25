import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { restore } from '@/lib/backup';
import { logActivity } from '@/lib/activity';

export const maxDuration = 60;

/** Puts the whole database back as it was in this backup. A safety backup of the current state is taken first. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser('admin');
    z.object({ confirm: z.literal('RESTORE', { errorMap: () => ({ message: 'Type RESTORE to confirm.' }) }) }).parse(await req.json());
    const r = await restore((await params).id, user.name);
    await logActivity('user', user.sub, user.name, `Database restored from ${r.from} (safety backup ${r.safety}).`).catch(() => null);
    return r;
  });
}
