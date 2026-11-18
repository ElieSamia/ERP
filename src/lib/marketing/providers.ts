import { createHash } from 'crypto';

/**
 * The two email-marketing services the ERP can send campaigns through. Each one does the same four things:
 * check the connection, put the campaign's recipients on a list, create and send (or schedule) the campaign,
 * and read the results back. Base addresses can be overridden for testing.
 */
export type Recipient = { email: string; firstName: string; lastName: string };
export type Stats = { sent: number; delivered: number; opens: number; clicks: number; unsubscribes: number; bounces: number; unsubscribedEmails: string[]; bouncedEmails: string[] };
export type ProviderCampaign = { name: string; subject: string; preheader: string; html: string; fromName: string; fromEmail: string; replyTo: string; scheduleAt?: string };
export type Provider = {
  check(): Promise<string>;
  lists?(): Promise<{ id: string; name: string; members: number }[]>;
  send(c: ProviderCampaign, to: Recipient[]): Promise<{ id: string; listRef: string }>;
  stats(id: string, listRef: string): Promise<Stats>;
  unsubscribeTag: string;
};
export class ProviderError extends Error {}

async function call(base: string, path: string, init: RequestInit & { json?: unknown }, auth: Record<string, string>) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...auth },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined, signal: AbortSignal.timeout(20000),
  }).catch((e) => { throw new ProviderError(`Couldn’t reach the service: ${(e as Error).message}`); });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : {};
  if (!res.ok) {
    const msg = data.detail || data.message || data.title || data.raw || `HTTP ${res.status}`;
    throw new ProviderError(res.status === 401 || res.status === 403 ? `The service refused the API key (${msg}). Check it in Settings.` : String(msg).slice(0, 300));
  }
  return data;
}
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/* ---------- Mailchimp (Marketing API 3.0) ---------- */
export function mailchimp(apiKey: string, listId: string): Provider {
  const dc = apiKey.split('-')[1] ?? '';
  if (!dc && !process.env.MAILCHIMP_API_BASE) throw new ProviderError('That doesn’t look like a Mailchimp API key: it should end with a dash and a code like us21.');
  const base = process.env.MAILCHIMP_API_BASE || `https://${dc}.api.mailchimp.com/3.0`;
  const auth = { Authorization: `Basic ${Buffer.from(`erp:${apiKey}`).toString('base64')}` };
  const mc = (path: string, init: RequestInit & { json?: unknown } = {}) => call(base, path, init, auth);
  return {
    unsubscribeTag: '*|UNSUB|*',
    async check() { const a = await mc('/'); return String(a.account_name || a.email || 'Mailchimp account'); },
    async lists() { const r = await mc('/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count'); return (r.lists || []).map((l: { id: string; name: string; stats?: { member_count?: number } }) => ({ id: l.id, name: l.name, members: l.stats?.member_count ?? 0 })); },
    async send(c, to) {
      if (!listId) throw new ProviderError('Choose the Mailchimp audience to use, in Settings.');
      // Add or update everyone on the audience, without re-subscribing people who unsubscribed there.
      for (const part of chunks(to, 500)) {
        await mc(`/lists/${listId}`, { method: 'POST', json: { update_existing: true, members: part.map((r) => ({ email_address: r.email, status_if_new: 'subscribed', merge_fields: { FNAME: r.firstName, LNAME: r.lastName } })) } });
      }
      // A static segment holds exactly this campaign's recipients.
      const seg = await mc(`/lists/${listId}/segments`, { method: 'POST', json: { name: `ERP ${c.name}`.slice(0, 100), static_segment: to.map((r) => r.email) } });
      const camp = await mc('/campaigns', { method: 'POST', json: {
        type: 'regular', recipients: { list_id: listId, segment_opts: { saved_segment_id: seg.id } },
        settings: { subject_line: c.subject, preview_text: c.preheader, title: c.name, from_name: c.fromName, reply_to: c.replyTo || c.fromEmail },
      } });
      await mc(`/campaigns/${camp.id}/content`, { method: 'PUT', json: { html: c.html } });
      if (c.scheduleAt) await mc(`/campaigns/${camp.id}/actions/schedule`, { method: 'POST', json: { schedule_time: c.scheduleAt } });
      else await mc(`/campaigns/${camp.id}/actions/send`, { method: 'POST' });
      return { id: String(camp.id), listRef: String(seg.id) };
    },
    async stats(id) {
      const r = await mc(`/reports/${id}`);
      const u = await mc(`/reports/${id}/unsubscribed?count=1000&fields=unsubscribes.email_address`).catch(() => ({ unsubscribes: [] }));
      const b = await mc(`/reports/${id}/sent-to?count=1000&fields=sent_to.email_address,sent_to.status`).catch(() => ({ sent_to: [] }));
      const bounced = (b.sent_to || []).filter((x: { status: string }) => x.status === 'hard' || x.status === 'soft').map((x: { email_address: string }) => x.email_address.toLowerCase());
      return {
        sent: r.emails_sent ?? 0, delivered: Math.max(0, (r.emails_sent ?? 0) - (r.bounces?.hard_bounces ?? 0) - (r.bounces?.soft_bounces ?? 0)),
        opens: r.opens?.unique_opens ?? 0, clicks: r.clicks?.unique_subscriber_clicks ?? 0, unsubscribes: r.unsubscribed ?? 0,
        bounces: (r.bounces?.hard_bounces ?? 0) + (r.bounces?.soft_bounces ?? 0),
        unsubscribedEmails: (u.unsubscribes || []).map((x: { email_address: string }) => x.email_address.toLowerCase()), bouncedEmails: bounced,
      };
    },
  };
}
export const mailchimpHash = (email: string) => createHash('md5').update(email.toLowerCase()).digest('hex');

/* ---------- Brevo (API v3) ---------- */
export function brevo(apiKey: string): Provider {
  const base = process.env.BREVO_API_BASE || 'https://api.brevo.com/v3';
  const bv = (path: string, init: RequestInit & { json?: unknown } = {}) => call(base, path, init, { 'api-key': apiKey });
  async function folder() {
    const r = await bv('/contacts/folders?limit=50&offset=0');
    const f = (r.folders || []).find((x: { name: string }) => x.name === 'ERP');
    return f ? f.id : (await bv('/contacts/folders', { method: 'POST', json: { name: 'ERP' } })).id;
  }
  return {
    unsubscribeTag: '{{ unsubscribe }}',
    async check() { const a = await bv('/account'); return String(a.companyName || a.email || 'Brevo account'); },
    async send(c, to) {
      const list = await bv('/contacts/lists', { method: 'POST', json: { name: `ERP ${c.name}`.slice(0, 100), folderId: await folder() } });
      const imp = await bv('/contacts/import', { method: 'POST', json: {
        listIds: [list.id], updateExistingContacts: true, emptyContactsAttributes: false,
        jsonBody: to.map((r) => ({ email: r.email, attributes: { FIRSTNAME: r.firstName, LASTNAME: r.lastName } })),
      } });
      // The import runs in the background; wait for it before sending (it takes seconds for a few thousand contacts).
      for (let i = 0; i < 30 && imp.processId; i++) {
        const p = await bv(`/processes/${imp.processId}`);
        if (p.status === 'completed') break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      const camp = await bv('/emailCampaigns', { method: 'POST', json: {
        name: c.name, subject: c.subject, previewText: c.preheader, sender: { name: c.fromName, email: c.fromEmail }, replyTo: c.replyTo || c.fromEmail,
        htmlContent: c.html, recipients: { listIds: [list.id] }, ...(c.scheduleAt ? { scheduledAt: c.scheduleAt } : {}),
      } });
      if (!c.scheduleAt) await bv(`/emailCampaigns/${camp.id}/sendNow`, { method: 'POST' });
      return { id: String(camp.id), listRef: String(list.id) };
    },
    async stats(id, listRef) {
      const r = await bv(`/emailCampaigns/${id}?statistics=globalStats`);
      const g = r.statistics?.globalStats ?? {};
      const members = await bv(`/contacts/lists/${listRef}/contacts?limit=500&offset=0`).catch(() => ({ contacts: [] }));
      const cs = (members.contacts || []) as { email: string; emailBlacklisted?: boolean }[];
      return {
        sent: g.sent ?? 0, delivered: g.delivered ?? 0, opens: g.uniqueViews ?? 0, clicks: g.uniqueClicks ?? 0, unsubscribes: g.unsubscriptions ?? 0,
        bounces: (g.hardBounces ?? 0) + (g.softBounces ?? 0),
        unsubscribedEmails: cs.filter((x) => x.emailBlacklisted).map((x) => x.email.toLowerCase()), bouncedEmails: [],
      };
    },
  };
}
