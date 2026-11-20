import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { getEnquirySettings, saveEnquirySettings } from '@/lib/enquiry';

const schema = z.object({
  enabled: z.boolean(), notify: z.boolean(), autoReply: z.boolean(),
  origins: z.array(z.string().trim().regex(/^https?:\/\/[a-z0-9.-]+(:\d+)?\/?$/i, 'List websites like https://thetravelconsult.com, one per line.')).max(10),
  autoReplyText: z.string().trim().max(1000), thankYou: z.string().trim().min(1).max(300), newKey: z.boolean().optional(),
});
export async function GET() {
  return handle(async () => { await requireUser('admin'); return getEnquirySettings(); });
}
export async function PUT(req: Request) {
  return handle(async () => { await requireUser('admin'); await saveEnquirySettings(schema.parse(await req.json())); return getEnquirySettings(); });
}
