import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { newInvite } from '@/lib/portal';
import { logActivity } from '@/lib/activity';
import { appUrl, sendInviteEmail } from '@/lib/mail';

/** A new link to set a password: for an invitation that expired, or when someone forgot theirs. The old password stops working. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const col = (await db()).collection('portalUsers');
    const u = await col.findOne({ _id: oid((await params).id) });
    if (!u) throw new HttpError(404, 'User not found.');
    const inv = newInvite();
    await col.updateOne({ _id: u._id }, { $set: { passwordHash: null, inviteHash: inv.hash, inviteExpires: inv.expires, failedLogins: 0 }, $unset: { lockedUntil: '' } });
    const inviteUrl = `${await appUrl(new URL(req.url).origin)}/portal/invite/${inv.token}`;
    const mail = await sendInviteEmail({ to: String(u.email), name: String(u.name), url: inviteUrl, reset: !!u.lastLogin });
    await logActivity('contact', String(u.contactId), user.name, `New password link created for ${u.name}.${mail.sent ? ' Emailed to them.' : ''}`);
    return { inviteUrl, mail };
  });
}
