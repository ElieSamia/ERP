import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { recentEmails, resendEmail } from '@/lib/mail';

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const { id, failedOnly } = z.object({ id: z.string(), failedOnly: z.boolean().default(false) }).parse(await req.json());
    const r = await resendEmail(id);
    if (!r.sent) throw new HttpError(502, r.error ?? 'Sending failed.');
    return { log: await recentEmails(25, failedOnly) };
  });
}
