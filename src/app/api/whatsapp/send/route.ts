import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { sendTemplate, sendText, WaError } from '@/lib/whatsapp';

const schema = z.union([
  z.object({ to: z.string().min(6, 'Enter the WhatsApp number with its country code, for example +961 70 123 456.'), text: z.string().trim().min(1, 'Write a message.').max(4096) }),
  z.object({ to: z.string().min(6, 'Enter the WhatsApp number with its country code, for example +961 70 123 456.'), template: z.string().min(1), language: z.string().min(2), params: z.array(z.string().max(1000)).max(10).default([]) }),
]);
/** A reply from the inbox: free text inside the 24-hour window, otherwise an approved template. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.parse(await req.json());
    try {
      return 'text' in b ? await sendText(b.to, b.text, user.name) : await sendTemplate({ to: b.to, template: b.template, language: b.language, params: b.params, by: user.name, urlSuffix: 'portal' });
    } catch (e) { if (e instanceof WaError) throw new HttpError(e.local ? (e.code === 131047 ? 409 : 400) : 502, e.message); throw e; }
  });
}
