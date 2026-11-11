import { z } from 'zod';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { handle, HttpError } from '@/lib/api';
import { createSession } from '@/lib/auth';
import { ensureIndexes } from '@/lib/indexes';
import { loadSampleData } from '@/lib/sample';
import { needsSetup } from '@/lib/queries';

const schema = z.object({
  company: z.string().trim().min(1, 'Enter your company name.'),
  name: z.string().trim().min(1, 'Enter your name.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(10, 'Use a password of at least 10 characters.'),
  sample: z.boolean().default(false),
});

export async function GET() {
  return handle(async () => ({ needsSetup: await needsSetup() }));
}

/** First run only: creates the first administrator. Refused once any user exists. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await needsSetup())) throw new HttpError(409, 'This system is already set up. Sign in instead.');
    const body = schema.parse(await req.json());
    await ensureIndexes();
    const d = await db();
    const r = await d.collection('users').insertOne({
      name: body.name, email: body.email, role: 'admin', active: true, passwordHash: await hash(body.password, 12), createdAt: new Date(),
    });
    await d.collection<{ _id: string }>('settings').updateOne(
      { _id: 'company' },
      { $set: { name: body.company, address: '', phone: '', email: '', financialNo: '', vatNo: '', commercialReg: '' } },
      { upsert: true },
    );
    if (body.sample) await loadSampleData(body.name);
    await createSession({ sub: String(r.insertedId), name: body.name, email: body.email, role: 'admin' });
    return { ok: true };
  });
}
