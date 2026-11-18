import { z } from 'zod';
import { db } from '@/lib/db';
import { handle } from '@/lib/api';
import { newInvite } from '@/lib/portal';
import { appUrl, mailReady, sendInviteEmail } from '@/lib/mail';

const schema = z.object({ email: z.string().trim().toLowerCase().email('Enter your email address.') });

/**
 * Emails a link to choose a new password. The answer is the same whether or not the address exists, so the form
 * can't be used to find out who has an account. The current password keeps working until a new one is set, and
 * a new link is sent at most once every 10 minutes per person.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { email } = schema.parse(await req.json());
    const done = { ok: true, message: 'If this email has portal access, we’ve sent a link to choose a new password. Check your inbox and spam folder.' };
    if (!(await mailReady())) return { ok: false, message: 'We can’t send emails at the moment. Please ask your account admin or contact us for a new link.' };
    const col = (await db()).collection('portalUsers');
    const u = await col.findOne({ email, active: { $ne: false } });
    if (!u) return done;
    if (u.resetRequestedAt instanceof Date && Date.now() - u.resetRequestedAt.getTime() < 10 * 60 * 1000) return done;
    const inv = newInvite(1);
    await col.updateOne({ _id: u._id }, { $set: { inviteHash: inv.hash, inviteExpires: inv.expires, resetRequestedAt: new Date() } });
    await sendInviteEmail({ to: String(u.email), name: String(u.name), url: `${await appUrl(new URL(req.url).origin)}/portal/invite/${inv.token}`, reset: true, days: 1, selfService: true });
    return done;
  });
}
