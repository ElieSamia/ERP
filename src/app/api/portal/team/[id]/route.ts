import { db } from '@/lib/db';
import { handle, HttpError, oid } from '@/lib/api';
import { editPortalUser, listPortalUsers, newInvite, requirePortal, userEditSchema } from '@/lib/portal';

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
    if (data.reset) {
      const inv = newInvite();
      await col.updateOne({ _id: u._id }, { $set: { passwordHash: null, inviteHash: inv.hash, inviteExpires: inv.expires } });
      inviteUrl = `${new URL(req.url).origin}/portal/invite/${inv.token}`;
    }
    await editPortalUser(u, data, `${ctx.name}, ${ctx.contactName}`);
    return { users: await listPortalUsers(ctx.contactId), inviteUrl };
  });
}
