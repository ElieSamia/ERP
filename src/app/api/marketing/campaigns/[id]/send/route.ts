import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { campaignHtml, getAudience, getCampaign, getMarketingSettings, provider, reachable, resolveAudience } from '@/lib/marketing';
import { ProviderError } from '@/lib/marketing/providers';
import { getCompany } from '@/lib/queries';

const schema = z.object({ scheduleAt: z.string().datetime({ offset: true }).optional() });

/**
 * Sends a draft (or schedules it) through Mailchimp or Brevo, to the audience's subscribed contacts with an email
 * address. The draft is locked first, so a double click can't send it twice; if the service refuses, it goes
 * back to draft with the service's message, ready to try again.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const { scheduleAt } = schema.parse(await req.json());
    const c = await getCampaign(id);
    if (!c) throw new HttpError(404, 'Campaign not found.');
    if (c.status !== 'draft') throw new HttpError(409, 'This campaign was already sent or scheduled.');
    if (!c.subject || !c.heading || !c.body) throw new HttpError(400, 'Add a subject, a heading and the message before sending.');
    const s = await getMarketingSettings();
    if (!s.provider) throw new HttpError(400, 'Connect Mailchimp or Brevo under Marketing → Connection first.');
    if (!s.fromEmail || !s.fromName) throw new HttpError(400, 'Set the sender name and address under Marketing → Connection.');
    if (!s.address) throw new HttpError(400, 'Add your postal address under Marketing → Connection. Anti-spam rules require it in every campaign.');
    if (scheduleAt) {
      const t = new Date(scheduleAt);
      if (t.getTime() < Date.now() + 10 * 60 * 1000) throw new HttpError(400, 'Schedule at least 10 minutes from now.');
      if (s.provider === 'mailchimp' && t.getUTCMinutes() % 15) throw new HttpError(400, 'Mailchimp schedules only on the quarter hour (:00, :15, :30, :45).');
    }
    const a = c.audienceId ? await getAudience(c.audienceId) : null;
    if (!a) throw new HttpError(400, 'Choose who receives this campaign.');
    const to = reachable(await resolveAudience(a.filter));
    if (!to.length) throw new HttpError(400, 'Nobody in this audience can receive it: they have no email address or have unsubscribed.');
    const col = (await db()).collection('campaigns');
    const lock = await col.updateOne({ _id: oid(id), status: 'draft' }, { $set: { status: 'sending' } });
    if (!lock.modifiedCount) throw new HttpError(409, 'This campaign is already being sent.');
    try {
      const p = await provider();
      const html = await campaignHtml(c, p.unsubscribeTag);
      const r = await p.send({ name: `${c.name} (${new Date().toISOString().slice(0, 10)})`, subject: c.subject, preheader: c.preheader, html, fromName: s.fromName || (await getCompany()).name, fromEmail: s.fromEmail, replyTo: s.replyTo, scheduleAt },
        to.map((m) => { const [first, ...rest] = m.name.split(' '); return { email: m.email, firstName: first, lastName: rest.join(' ') }; }));
      await col.updateOne({ _id: oid(id) }, { $set: {
        status: scheduleAt ? 'scheduled' : 'sent', provider: s.provider, providerId: r.id, listRef: r.listRef, recipients: to.length, recipientEmails: to.map((m) => m.email),
        audienceName: a.name, scheduledAt: scheduleAt ? new Date(scheduleAt) : null, sentAt: scheduleAt ? null : new Date(), sentBy: user.name, error: '',
      } });
      return getCampaign(id);
    } catch (e) {
      const msg = e instanceof ProviderError ? e.message : 'Something went wrong while sending.';
      await col.updateOne({ _id: oid(id) }, { $set: { status: 'draft', error: msg } });
      if (!(e instanceof ProviderError)) console.error('Campaign send failed', e);
      throw new HttpError(502, `${s.provider === 'mailchimp' ? 'Mailchimp' : 'Brevo'}: ${msg}`);
    }
  });
}
