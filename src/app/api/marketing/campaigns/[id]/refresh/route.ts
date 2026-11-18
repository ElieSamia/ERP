import { handle, HttpError, requireUser } from '@/lib/api';
import { getCampaign, refreshStats } from '@/lib/marketing';
import { ProviderError } from '@/lib/marketing/providers';

/** Reads the latest opens, clicks, unsubscribes and bounces, and turns marketing off for anyone who left. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const c = await getCampaign((await params).id);
    if (!c) throw new HttpError(404, 'Campaign not found.');
    if (!c.providerId) throw new HttpError(409, 'This campaign hasn’t been sent yet.');
    try { return await refreshStats(c, user.name); }
    catch (e) { if (e instanceof ProviderError) throw new HttpError(502, e.message); throw e; }
  });
}
