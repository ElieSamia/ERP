import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { paxFor, sealPax } from '@/lib/travellers';
import { logActivity } from '@/lib/activity';

const date = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const pax = z.object({
  name: z.string().trim().min(1).max(120),
  title: z.enum(['', 'mr', 'ms', 'mrs', 'miss', 'dr']).default(''),
  givenName: z.string().trim().max(60).default(''), familyName: z.string().trim().max(60).default(''),
  gender: z.enum(['', 'm', 'f']).default(''), bornOn: date.default(''),
  nationality: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, 'Use 2-letter country codes, like LB.').default(''),
  email: z.string().trim().max(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Check the email addresses.').default(''),
  phone: z.string().trim().max(30).refine((v) => !v || /^\+[1-9]\d{6,14}$/.test(v.replace(/[\s-]/g, '')), 'Phone numbers need the country code, like +96170123456.').default(''),
  passportNumber: z.string().trim().toUpperCase().max(20).regex(/^[A-Z0-9]*$/, 'Passport numbers use letters and digits only.').default(''),
  passportCountry: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, 'Use 2-letter country codes, like LB.').default(''),
  passportExpiry: date.default(''),
});

type Ctx = { params: Promise<{ id: string }> };
/** Staff only: includes passport details. */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const b = await (await db()).collection('bookings').findOne({ _id: oid((await params).id) });
    if (!b) throw new HttpError(404, 'Booking not found.');
    return paxFor(b);
  });
}
export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const list = z.array(pax).max(30).parse(await req.json());
    const today = new Date().toISOString().slice(0, 10);
    for (const p of list) {
      if (p.bornOn && p.bornOn >= today) throw new HttpError(400, `Check the date of birth for ${p.name}.`);
      if (p.passportNumber && (!p.passportCountry || !p.passportExpiry)) throw new HttpError(400, `Add the issuing country and expiry date of ${p.name}’s passport.`);
      if (p.passportExpiry && p.passportExpiry < today) throw new HttpError(400, `${p.name}’s passport has expired.`);
    }
    const col = (await db()).collection('bookings');
    const b = await col.findOne({ _id: oid(id) });
    if (!b) throw new HttpError(404, 'Booking not found.');
    await col.updateOne({ _id: b._id }, { $set: { pax: list.map((p) => sealPax({ ...p, phone: p.phone.replace(/[\s-]/g, '') })) } });
    await logActivity('booking', id, user.name, 'Traveller details updated.');
    return paxFor((await col.findOne({ _id: b._id }))!);
  });
}
