import { db } from '@/lib/db';
import { handle, HttpError, oid } from '@/lib/api';
import { editPortalUser, listPortalUsers, newInvite, requirePortal, userEditSchema } from '@/lib/portal';
import { appUrl, sendInviteEmail, type MailResult } from '@/lib/mail';

/** Changes a colleague's details, role or status, or makes a new password link. Never your own access. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requirePortal((p) => p.manageUsers === 'yes');
    const id = (await params).id;
    const data = userEditSchema.parse(await req.json());
    if (id === ctx.userId && (data.roleId !== undefined || data.active !== undefined || data.reset))
      throw new HttpError(400, 'You can’t change your own access. Ask another admin on your account, or us.');
    const col = (await db()).collection('portalUsers');
    const u = await col.findOne({ _id: oid(id), contactId: ctx.contactId });
    if (!u) throw new HttpError(404, 'User not found.');
    let inviteUrl: string | undefined;
    let mail: MailResult | undefined;
    if (data.reset) {
      const inv = newInvite();
      await col.updateOne({ _id: u._id }, { $set: { passwordHash: null, inviteHash: inv.hash, inviteExpires: inv.expires } });
      inviteUrl = `${await appUrl(new URL(req.url).origin)}/portal/invite/${inv.token}`;
      mail = await sendInviteEmail({ to: String(u.email), name: String(u.name), url: inviteUrl, reset: true });
    }
    await editPortalUser(u, data, `${ctx.name}, ${ctx.contactName}`);
    return { users: await listPortalUsers(ctx.contactId), inviteUrl, mail };
  });
}
