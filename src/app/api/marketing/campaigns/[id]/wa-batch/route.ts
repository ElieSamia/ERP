import { handle, HttpError, requireUser } from '@/lib/api';
import { waBatch, waStats, getCampaign } from '@/lib/marketing';

/** Sends the next batch of a WhatsApp campaign (up to 25); the screen repeats the call until done. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const c = await getCampaign(id);
    if (!c || c.channel !== 'whatsapp') throw new HttpError(404, 'WhatsApp campaign not found.');
    const r = await waBatch(id, user.name);
    return { ...r, stats: await waStats(id), campaign: await getCampaign(id) };
  });
}
