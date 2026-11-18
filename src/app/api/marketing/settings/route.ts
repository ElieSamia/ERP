import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { getMarketingSettings, saveMarketingSettings } from '@/lib/marketing';

const schema = z.object({
  provider: z.enum(['', 'mailchimp', 'brevo']),
  fromName: z.string().trim().max(100), fromEmail: z.string().trim().max(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Check the sending address.'),
  replyTo: z.string().trim().max(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Check the reply address.'),
  address: z.string().trim().max(300), mailchimpList: z.string().trim().max(40),
  mailchimpKey: z.string().trim().max(200).optional(), brevoKey: z.string().trim().max(300).optional(),
});

export async function GET() {
  return handle(async () => { await requireUser('admin'); return getMarketingSettings(); });
}
/** Saves the marketing connection. Empty key fields keep the saved keys, which are stored encrypted and never sent back. */
export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const d = schema.parse(await req.json());
    await saveMarketingSettings({ ...d, mailchimpKey: d.mailchimpKey || undefined, brevoKey: d.brevoKey || undefined });
    return getMarketingSettings();
  });
}
