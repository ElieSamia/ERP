import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { campaignHtml, getCampaign } from '@/lib/marketing';
import { sendMail } from '@/lib/mail';

/** Sends one copy to you through your own mailbox, to check how it looks before it goes to the audience. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser();
    const c = await getCampaign((await params).id);
    if (!c) throw new HttpError(404, 'Campaign not found.');
    const { to } = z.object({ to: z.string().trim().email('Enter the address to send the test to.') }).parse(await req.json());
    if (!c.subject || !c.heading || !c.body) throw new HttpError(400, 'Add a subject, a heading and the message first.');
    const html = await campaignHtml(c, null);
    const r = await sendMail({ to, subject: `[Test] ${c.subject}`, html, text: `${c.heading}\n\n${c.body}${c.buttonText ? `\n\n${c.buttonText}: ${c.buttonUrl}` : ''}`, kind: 'campaign-test', ref: { model: 'campaign', id: c.id } });
    if (!r.sent) throw new HttpError(502, r.error ?? 'Sending failed.');
    return { ok: true };
  });
}
