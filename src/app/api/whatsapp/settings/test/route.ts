import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { sendTemplate, WaError } from '@/lib/whatsapp';

/** Sends one approved template to a number you choose, to prove the connection works. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser('admin');
    const b = z.object({ to: z.string().min(6, 'Enter the WhatsApp number with its country code, for example +961 70 123 456.'), template: z.string().min(1), language: z.string().min(2) }).parse(await req.json());
    try { return await sendTemplate({ to: b.to, template: b.template, language: b.language, params: [user.name.split(' ')[0], 'TEST', 'The Travel Consult'], urlSuffix: 'test', by: user.name }); }
    catch (e) { if (e instanceof WaError) throw new HttpError(e.local ? 400 : 502, e.message); throw e; }
  });
}
