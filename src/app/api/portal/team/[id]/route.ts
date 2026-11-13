import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid } from '@/lib/api';
import { getRoles, listPortalUsers, newInvite, requirePortal } from '@/lib/portal';
import { logActivity } from '@/lib/activity';

/** Changes a colleague's role, switches them off, or makes a new password link. Never your own account. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requirePortal((p) => p.manageUsers === 'yes');
    const id = (await params).id;
    if (id === ctx.userId) throw new HttpError(400, 'You can’t change your own access. Ask another admin on your account, or us.');
    const data = z.object({ roleId: z.string().optional(), active: z.boolean().optional(), reset: z.boolean().optional() }).parse(await req.json());
    const col = (await db()).collection('portalUsers');
    const u = await col.findOne({ _id: oid(id), contactId: ctx.contactId });
    if (!u) throw new HttpError(404, 'User not found.');
    if (data.roleId && !(await getRoles()).some((r) => r.id === data.roleId)) throw new HttpError(400, 'Choose a role.');
    const who = `${ctx.name}, ${ctx.contactName}`;
    let inviteUrl: string | undefined;
    if (data.reset) {
      const inv = newInvite();
      await col.updateOne({ _id: u._id }, { $set: { passwordHash: null, inviteHash: inv.hash, inviteExpires: inv.expires } });
      inviteUrl = `${new URL(req.url).origin}/portal/invite/${inv.token}`;
    }
    const set: Record<string, unknown> = {};
    if (data.roleId) set.roleId = data.roleId;
    if (data.active !== undefined) set.active = data.active;
    if (Object.keys(set).length) await col.updateOne({ _id: u._id }, { $set: set });
    await logActivity('contact', ctx.contactId, who, `Portal user ${u.name} updated by their account admin.`);
    return { users: await listPortalUsers(ctx.contactId), inviteUrl };
  });
}
