import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { provider } from '@/lib/marketing';
import { ProviderError } from '@/lib/marketing/providers';

/** Checks a saved key against the service and, for Mailchimp, lists its audiences to choose from. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const { which } = z.object({ which: z.enum(['mailchimp', 'brevo']) }).parse(await req.json());
    try {
      const p = await provider(which);
      return { account: await p.check(), lists: p.lists ? await p.lists() : [] };
    } catch (e) {
      if (e instanceof ProviderError) throw new HttpError(502, e.message);
      throw e;
    }
  });
}
