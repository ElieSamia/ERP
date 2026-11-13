import { z } from 'zod';
import { compare } from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { db } from '@/lib/db';
import { handle, HttpError } from '@/lib/api';
import { createPortalSession, isLocked, recordLogin, LOCK_MINUTES } from '@/lib/portal';

const schema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') });

export async function POST(req: Request) {
  return handle(async () => {
    const { email, password } = schema.parse(await req.json());
    const d = await db();
    const u = await d.collection('portalUsers').findOne({ email });
    if (u && isLocked(u)) throw new HttpError(429, `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.`);
    const c = u && ObjectId.isValid(String(u.contactId)) ? await d.collection('contacts').findOne({ _id: new ObjectId(String(u.contactId)) }) : null;
    const good = !!u && !!u.active && !!u.passwordHash && !!c && c.portalAccess === 'yes' && (await compare(password, String(u.passwordHash)));
    if (u) await recordLogin('portalUsers', u, good);
    if (!u || !good) throw new HttpError(401, 'The email or password is incorrect, or your access is switched off.');
    await createPortalSession({ id: String(u._id), name: String(u.name), email, contactId: String(u.contactId) });
    return { ok: true };
  });
}
