import { z } from 'zod';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { handle, HttpError } from '@/lib/api';
import { createSession } from '@/lib/auth';

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
    if (!u || !u.active || !(await compare(password, String(u.passwordHash)))) throw new HttpError(401, 'The email or password is incorrect.');
    await users.updateOne({ _id: u._id }, { $set: { lastLogin: new Date() } });
    await createSession({ sub: String(u._id), name: String(u.name), email, role: u.role === 'admin' ? 'admin' : 'staff' });
    return { ok: true };
  });
}
