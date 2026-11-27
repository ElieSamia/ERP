import { audit } from '@/lib/audit';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { db } from '@/lib/db';
import { handle, HttpError } from '@/lib/api';
import { createSession } from '@/lib/auth';
import { isLocked, recordLogin, LOCK_MINUTES } from '@/lib/portal';
import { TWO_STEP_COOKIE, verifyTicket } from '@/lib/session-token';
import { decrypt } from '@/lib/mail';
import { hashCode, verifyCode } from '@/lib/totp';

const schema = z.object({ code: z.string().trim().min(6, 'Enter the 6-digit code.').max(20) });

/**
 * Second sign-in step: the 6-digit code from the authenticator app, or one of the recovery codes. Wrong codes
 * count towards the same lock as wrong passwords, and a code can't be used twice.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const jar = await cookies();
    const sub = await verifyTicket(jar.get(TWO_STEP_COOKIE)?.value);
    if (!sub || !ObjectId.isValid(sub)) throw new HttpError(401, 'That took too long. Sign in again with your password.');
    const { code } = schema.parse(await req.json());
    const users = (await db()).collection('users');
    const u = await users.findOne({ _id: new ObjectId(sub) });
    if (!u || !u.active || !u.totpEnabled || !u.totpEnc) throw new HttpError(401, 'Sign in again with your password.');
    if (isLocked(u)) throw new HttpError(429, `Too many wrong attempts. Try again in ${LOCK_MINUTES} minutes.`);
    let ok = false;
    const step = verifyCode(decrypt(String(u.totpEnc)), code);
    if (step !== null && step > (u.totpLastStep ?? -1)) {
      ok = true;
      await users.updateOne({ _id: u._id }, { $set: { totpLastStep: step } });
    } else if (/^[0-9a-f]{5}-[0-9a-f]{5}$/i.test(code)) {
      const h = hashCode(code);
      const r = await users.updateOne({ _id: u._id, recoveryHashes: h }, { $pull: { recoveryHashes: h } } as never);
      ok = r.modifiedCount === 1;
    }
    await recordLogin('users', u, ok);
    if (!ok) { await audit({ kind: 'sign-in', action: 'Wrong two-step code', who: String(u.name), whoId: String(u._id), target: String(u.email) }); throw new HttpError(401, 'That code isn’t right. Check the time on your phone, or use a recovery code.'); }
    jar.delete(TWO_STEP_COOKIE);
    await createSession({ sub: String(u._id), name: String(u.name), email: String(u.email), role: u.role === 'admin' ? 'admin' : 'staff' });
    await audit({ kind: 'sign-in', action: /^[0-9a-f]{5}-[0-9a-f]{5}$/i.test(code) ? 'Signed in with a recovery code' : 'Signed in (two-step)', who: String(u.name), whoId: String(u._id), target: String(u.email) });
    return { ok: true, recoveryLeft: (u.recoveryHashes as string[] | undefined)?.length ?? 0 };
  });
}
