import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { logActivity } from '@/lib/activity';
import { listUsers } from '@/lib/queries';

/** For a colleague who lost their phone and recovery codes: an administrator turns their two-step sign-in off. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser('admin');
    const id = (await params).id;
    const r = await (await db()).collection('users').updateOne({ _id: oid(id) }, { $set: { totpEnabled: false }, $unset: { totpEnc: '', recoveryHashes: '', totpLastStep: '', totpPendingEnc: '' } });
    if (!r.matchedCount) throw new HttpError(404, 'User not found.');
    await logActivity('user', id, me.name, 'Two-step sign-in reset by an administrator.');
    return listUsers();
  });
}
