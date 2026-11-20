import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { getWaSettings, saveWaSettings } from '@/lib/whatsapp';

const ev = z.object({ on: z.boolean(), template: z.string().max(512), language: z.string().max(20) });
const schema = z.object({
  enabled: z.boolean(), phoneNumberId: z.string().trim().regex(/^\d*$/, 'The phone number ID is digits only.').max(30),
  wabaId: z.string().trim().regex(/^\d*$/, 'The WhatsApp Business account ID is digits only.').max(30), displayNumber: z.string().trim().max(30),
  token: z.string().trim().max(1000).optional(), appSecret: z.string().trim().max(200).optional(),
  events: z.object({ share: ev, 'booking-confirmed': ev, 'invoice-posted': ev, 'payment-received': ev, 'po-sent': ev }),
});
export async function GET() {
  return handle(async () => { await requireUser('admin'); return getWaSettings(); });
}
/** Empty token and app secret fields keep the saved ones, which are stored encrypted and never sent back. */
export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const d = schema.parse(await req.json());
    await saveWaSettings({ ...d, token: d.token || undefined, appSecret: d.appSecret || undefined });
    return getWaSettings();
  });
}
