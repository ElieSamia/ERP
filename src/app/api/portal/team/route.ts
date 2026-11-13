import { handle } from '@/lib/api';
import { inviteSchema, inviteUser, listPortalUsers, requirePortal } from '@/lib/portal';

export async function GET() {
  return handle(async () => { const ctx = await requirePortal((p) => p.manageUsers === 'yes'); return listPortalUsers(ctx.contactId); });
}
/** An account admin invites a colleague to their own account only. */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requirePortal((p) => p.manageUsers === 'yes');
    return inviteUser(ctx.contactId, inviteSchema.parse(await req.json()), new URL(req.url).origin, `${ctx.name}, ${ctx.contactName}`);
  });
}
