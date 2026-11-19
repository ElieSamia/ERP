import { z } from 'zod';
import { compare } from 'bcryptjs';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { decrypt, encrypt } from '@/lib/mail';
import { getCompany } from '@/lib/queries';
import { hashCode, newSecret, otpauthUri, recoveryCodes, verifyCode } from '@/lib/totp';
import { logActivity } from '@/lib/activity';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('confirm'), code: z.string().trim() }),
  z.object({ action: z.literal('disable'), password: z.string().min(1, 'Enter your password.') }),
  z.object({ action: z.literal('new-codes'), password: z.string().min(1, 'Enter your password.') }),
]);

export async function GET() {
  return handle(async () => {
    const me = await requireUser();
    const u = await (await db()).collection('users').findOne({ _id: oid(me.sub) });
    return { enabled: !!u?.totpEnabled, recoveryLeft: (u?.recoveryHashes as string[] | undefined)?.length ?? 0 };
  });
}

/** Turn two-step sign-in on (scan, then confirm a code), off, or make new recovery codes. Each person does their own. */
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const body = schema.parse(await req.json());
    const users = (await db()).collection('users');
    const u = await users.findOne({ _id: oid(me.sub) });
    if (!u) throw new HttpError(404, 'User not found.');
    const fresh = () => { const codes = recoveryCodes(); return { codes, hashes: codes.map(hashCode) }; };
    if (body.action === 'start') {
      if (u.totpEnabled) throw new HttpError(409, 'Two-step sign-in is already on.');
      const secret = newSecret();
      await users.updateOne({ _id: u._id }, { $set: { totpPendingEnc: encrypt(secret) } });
      const uri = otpauthUri(secret, String(u.email), (await getCompany()).name || 'Travel ERP');
      return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), qr: await QRCode.toString(uri, { type: 'svg', margin: 1, width: 200 }) };
    }
    if (body.action === 'confirm') {
      if (!u.totpPendingEnc) throw new HttpError(400, 'Start again: select Turn on two-step sign-in.');
      const secret = decrypt(String(u.totpPendingEnc));
      const step = verifyCode(secret, body.code);
      if (step === null) throw new HttpError(400, 'That code isn’t right. Enter the 6 digits the app shows now.');
      const { codes, hashes } = fresh();
      await users.updateOne({ _id: u._id }, { $set: { totpEnabled: true, totpEnc: encrypt(secret), totpLastStep: step, recoveryHashes: hashes }, $unset: { totpPendingEnc: '' } });
      await logActivity('user', me.sub, me.name, 'Two-step sign-in turned on.');
      return { enabled: true, codes };
    }
    if (!(await compare(body.password, String(u.passwordHash)))) throw new HttpError(400, 'That password isn’t right.');
    if (body.action === 'disable') {
      await users.updateOne({ _id: u._id }, { $set: { totpEnabled: false }, $unset: { totpEnc: '', recoveryHashes: '', totpLastStep: '', totpPendingEnc: '' } });
      await logActivity('user', me.sub, me.name, 'Two-step sign-in turned off.');
      return { enabled: false };
    }
    if (!u.totpEnabled) throw new HttpError(409, 'Two-step sign-in is off.');
    const { codes, hashes } = fresh();
    await users.updateOne({ _id: u._id }, { $set: { recoveryHashes: hashes } });
    return { enabled: true, codes };
  });
}
