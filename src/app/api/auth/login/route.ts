import { z } from 'zod';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { handle, HttpError } from '@/lib/api';
import { createSession } from '@/lib/auth';
import { isLocked, recordLogin, LOCK_MINUTES } from '@/lib/portal';
import { cookies } from 'next/headers';
import { signTicket, TWO_STEP_COOKIE } from '@/lib/session-token';

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export async function POST(req: Request) {
  return handle(async () => {
    const { email, password } = schema.parse(await req.json());
    const users = (await db()).collection('users');
    const u = await users.findOne({ email });
    // Same message for every failure, so the form doesn't reveal which emails exist.
    if (u && isLocked(u)) throw new HttpError(429, `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.`);
    const good = !!u && !!u.active && (await compare(password, String(u.passwordHash)));
    if (u) await recordLogin('users', u, good);
    if (!u || !good) throw new HttpError(401, 'The email or password is incorrect.');
    if (u.totpEnabled) {
      // Password right; the session only starts once the code from the authenticator app is checked too.
      (await cookies()).set(TWO_STEP_COOKIE, await signTicket(String(u._id)), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 300 });
      return { twoStep: true };
    }
    await createSession({ sub: String(u._id), name: String(u.name), email, role: u.role === 'admin' ? 'admin' : 'staff' });
    return { ok: true };
  });
}
