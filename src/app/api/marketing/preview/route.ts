import { handle, requireUser } from '@/lib/api';
import { campaignHtml } from '@/lib/marketing';
import { campaignSchema } from '@/lib/schemas';

/** The campaign email exactly as it will be sent, for the live preview in the editor. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const c = campaignSchema.partial().parse(await req.json());
    return { html: await campaignHtml({ heading: c.heading || 'Your heading', body: c.body || 'Your message appears here.', imageUrl: c.imageUrl || '', buttonText: c.buttonText || '', buttonUrl: c.buttonUrl || '', preheader: c.preheader || '' }, null) };
  });
}
