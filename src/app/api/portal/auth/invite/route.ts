import { z } from 'zod';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { handle, HttpError } from '@/lib/api';
import { createPortalSession, hashToken } from '@/lib/portal';

const schema = z.object({ token: z.string().min(20).max(80), password: z.string().min(10, 'Use a password of at least 10 characters.').max(200) });

/** Sets the password from an invitation or reset link, then signs the person in. Each link works once. */
export async function POST(req: Request) {
  return handle(async () => {
    const { token, password } = schema.parse(await req.json());
    const col = (await db()).collection('portalUsers');
    const u = await col.findOne({ inviteHash: hashToken(token) });
    if (!u || !u.active || !(u.inviteExpires instanceof Date) || u.inviteExpires < new Date()) throw new HttpError(400, 'This link has expired or was already used. Ask for a new one.');
    await col.updateOne({ _id: u._id }, { $set: { passwordHash: await hash(password, 12), lastLogin: new Date(), failedLogins: 0 }, $unset: { inviteHash: '', inviteExpires: '', lockedUntil: '' } });
    await createPortalSession({ id: String(u._id), name: String(u.name), email: String(u.email), contactId: String(u.contactId) });
    return { ok: true };
  });
}
