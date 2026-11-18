import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { layout, recentEmails, sendMail } from '@/lib/mail';

/** Sends a test email with the saved settings and reports exactly what the mail server said. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser('admin');
    const { to } = z.object({ to: z.string().trim().email('Enter the address to send the test to.') }).parse(await req.json());
    const m = await layout({ heading: 'Test email from your ERP', paragraphs: [`Sent by ${user.name}.`, 'If you can read this, email sending works: invitations, portal notifications and documents will go out from this address.'] });
    const r = await sendMail({ to, subject: 'Test email from your ERP', ...m, kind: 'test' });
    if (!r.sent) throw new HttpError(502, r.error ?? 'Sending failed.');
    return { ok: true, log: await recentEmails() };
  });
}
