import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { ObjectId } from 'mongodb';
import { db } from './db';
import { decrypt, encrypt } from './mail';

/**
 * WhatsApp through Meta's WhatsApp Cloud API (graph.facebook.com). Messages you start must use a template Meta
 * has approved; within 24 hours of the customer's last message you may also send free text. Delivery and read
 * receipts, and the customer's replies, arrive on the webhook. Base address can be overridden for testing.
 */
export type WaTemplate = { name: string; language: string; category: string; status: string; body: string; vars: number; urlButton: boolean };
export type WaEvent = 'share' | 'booking-confirmed' | 'invoice-posted' | 'payment-received' | 'po-sent';
export const WA_EVENTS: [WaEvent, string, string][] = [
  ['share', 'Documents you send with Share on WhatsApp', 'Any document'],
  ['booking-confirmed', 'Booking confirmed', 'Booking confirmation, to the customer'],
  ['invoice-posted', 'Invoice posted', 'Invoice, to the customer'],
  ['payment-received', 'Payment received', 'Receipt, to the customer'],
  ['po-sent', 'Purchase order sent', 'Purchase order, to the supplier'],
];
export type WaSettings = {
  enabled: boolean; phoneNumberId: string; wabaId: string; displayNumber: string; verifyToken: string;
  hasToken: boolean; hasAppSecret: boolean; templates: WaTemplate[]; templatesAt: string;
  events: Record<WaEvent, { on: boolean; template: string; language: string }>;
};
type Stored = Omit<WaSettings, 'hasToken' | 'hasAppSecret'> & { tokenEnc?: string; appSecretEnc?: string };
const EMPTY_EVENTS = Object.fromEntries(WA_EVENTS.map(([k]) => [k, { on: k === 'share', template: '', language: '' }])) as WaSettings['events'];

async function stored(): Promise<Stored> {
  const col = (await db()).collection<{ _id: string } & Stored>('settings');
  let d = await col.findOne({ _id: 'whatsapp' });
  if (!d?.verifyToken) {
    // A random token Meta must echo when you register the webhook, so nobody else can register one for you.
    const verifyToken = randomBytes(16).toString('hex');
    await col.updateOne({ _id: 'whatsapp' }, { $set: { verifyToken } }, { upsert: true });
    d = await col.findOne({ _id: 'whatsapp' });
  }
  const { _id, ...rest } = d!;
  void _id;
  const defaults = { enabled: false, phoneNumberId: '', wabaId: '', displayNumber: '', templates: [] as WaTemplate[], templatesAt: '' };
  return { ...defaults, ...rest, events: { ...EMPTY_EVENTS, ...(rest.events || {}) } } as Stored;
}
export async function getWaSettings(): Promise<WaSettings> {
  const { tokenEnc, appSecretEnc, ...s } = await stored();
  return { ...s, hasToken: !!tokenEnc, hasAppSecret: !!appSecretEnc };
}
export async function saveWaSettings(s: Partial<Omit<WaSettings, 'hasToken' | 'hasAppSecret' | 'verifyToken'>> & { token?: string; appSecret?: string }) {
  const { token, appSecret, ...rest } = s;
  await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'whatsapp' }, { $set: {
    ...rest, ...(token ? { tokenEnc: encrypt(token.trim()) } : {}), ...(appSecret ? { appSecretEnc: encrypt(appSecret.trim()) } : {}),
  } }, { upsert: true });
}
export async function waReady() {
  const s = await stored();
  return s.enabled && !!s.tokenEnc && !!s.phoneNumberId;
}

/** Phone numbers as Meta wants them: country code and digits only (+961 70 123 456 → 96170123456). */
export const waNumber = (p: string) => p.replace(/[^\d]/g, '').replace(/^00/, '');
export const validWaNumber = (p: string) => /^[1-9]\d{7,14}$/.test(waNumber(p));

/** local = our own check before calling Meta (something to fix), as opposed to Meta refusing. */
export class WaError extends Error { constructor(message: string, public code = 0, public local = false) { super(message); } }
async function graph(path: string, init: { method?: string; body?: unknown } = {}) {
  const s = await stored();
  if (!s.tokenEnc) throw new WaError('Add the WhatsApp access token in Settings first.', 0, true);
  const base = process.env.WHATSAPP_API_BASE || 'https://graph.facebook.com/v21.0';
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET', headers: { Authorization: `Bearer ${decrypt(s.tokenEnc)}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(20000),
  }).catch((e) => { throw new WaError(`Couldn’t reach WhatsApp: ${(e as Error).message}`); });
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_data?: { details?: string } } } & Record<string, unknown>;
  if (!res.ok || j.error) {
    const e = j.error ?? {};
    const code = e.code ?? 0;
    const msg = code === 190 ? 'Meta refused the access token (expired or wrong). Create a permanent system-user token and save it again.'
      : code === 131047 ? 'More than 24 hours have passed since this customer last wrote, so only an approved template can be sent.'
      : code === 132001 ? 'Meta doesn’t know that template in that language. Sync templates and check its name.'
      : code === 131026 ? 'This number can’t receive WhatsApp messages (not on WhatsApp, or an old app version).'
      : e.error_data?.details || e.message || `HTTP ${res.status}`;
    throw new WaError(msg, code);
  }
  return j;
}

/** Templates approved for this WhatsApp Business account, with how many {{variables}} they take and whether they have a link button. */
export async function syncTemplates() {
  const s = await stored();
  if (!s.wabaId) throw new WaError('Add the WhatsApp Business account ID first.', 0, true);
  const r = await graph(`/${s.wabaId}/message_templates?fields=name,language,status,category,components&limit=200`);
  type Comp = { type: string; text?: string; buttons?: { type: string; url?: string }[] };
  const list: WaTemplate[] = ((r.data as { name: string; language: string; status: string; category: string; components: Comp[] }[]) ?? []).map((t) => {
    const body = t.components.find((c) => c.type === 'BODY')?.text ?? '';
    return {
      name: t.name, language: t.language, category: t.category, status: t.status, body,
      vars: new Set(body.match(/\{\{\d+\}\}/g) ?? []).size,
      urlButton: !!t.components.find((c) => c.type === 'BUTTONS')?.buttons?.some((b) => b.type === 'URL' && /\{\{1\}\}/.test(b.url ?? '')),
    };
  });
  await saveWaSettings({ templates: list, templatesAt: new Date().toISOString() });
  return list;
}

/** Finds the contact a phone number belongs to, for linking conversations. */
async function contactFor(phone: string) {
  const digits = waNumber(phone);
  // Phones are stored as typed (+961 1 998 300): match the last 7 digits with any spaces or dashes between them.
  const pattern = digits.slice(-7).split('').join('\\D*');
  const cs = await (await db()).collection('contacts').find({ phone: { $regex: pattern } }, { projection: { phone: 1, name: 1 } }).toArray();
  return cs.find((c) => waNumber(String(c.phone)) === digits) ?? null;
}

type SendTemplate = { to: string; template: string; language: string; params: string[]; urlSuffix?: string; by: string; ref?: { model: string; id: string } };
/** Sends an approved template; the text actually sent (with variables filled in) is kept in the conversation. */
export async function sendTemplate(m: SendTemplate) {
  const s = await stored();
  const t = s.templates.find((x) => x.name === m.template && x.language === m.language);
  if (!t) throw new WaError(`The template “${m.template}” (${m.language}) isn’t in the synced list. Sync templates in Settings.`, 0, true);
  if (t.status !== 'APPROVED') throw new WaError(`Meta hasn’t approved the template “${m.template}” yet (status ${t.status}).`, 0, true);
  const to = waNumber(m.to);
  if (!validWaNumber(to)) throw new WaError('That phone number needs its country code, for example +961 70 123 456.', 0, true);
  const params = m.params.slice(0, t.vars);
  while (params.length < t.vars) params.push('-');
  const components: unknown[] = [];
  if (t.vars) components.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p || '-' })) });
  if (t.urlButton) {
    if (!m.urlSuffix) throw new WaError(`The template “${m.template}” has a link button but there’s no link to put in it.`, 0, true);
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: m.urlSuffix }] });
  }
  const text = t.body.replace(/\{\{(\d+)\}\}/g, (_x, n) => params[Number(n) - 1] ?? '');
  return record(to, 'template', text, m.by, m.ref, () => graph(`/${s.phoneNumberId}/messages`, { method: 'POST', body: {
    messaging_product: 'whatsapp', to, type: 'template', template: { name: t.name, language: { code: t.language }, ...(components.length ? { components } : {}) },
  } }), t.name);
}

/** Free text: allowed only within 24 hours of the customer's last message (Meta's customer service window). */
export async function sendText(toRaw: string, body: string, by: string) {
  const s = await stored();
  const to = waNumber(toRaw);
  const last = await (await db()).collection('wamessages').findOne({ phone: to, direction: 'in' }, { sort: { at: -1 } });
  if (!last || Date.now() - (last.at as Date).getTime() > 24 * 3600e3) throw new WaError('More than 24 hours have passed since this customer last wrote, so only an approved template can be sent.', 131047, true);
  return record(to, 'text', body, by, undefined, () => graph(`/${s.phoneNumberId}/messages`, { method: 'POST', body: { messaging_product: 'whatsapp', to, type: 'text', text: { body, preview_url: true } } }));
}

async function record(phone: string, type: 'template' | 'text', body: string, by: string, ref: { model: string; id: string } | undefined, send: () => Promise<Record<string, unknown>>, template?: string) {
  const col = (await db()).collection('wamessages');
  const c = await contactFor(phone);
  const base = { phone, contactId: c ? String(c._id) : null, direction: 'out', type, body, template: template ?? null, by, ref: ref ?? null, at: new Date() };
  try {
    const r = await send();
    const waId = String(((r.messages as { id: string }[]) ?? [])[0]?.id ?? '');
    await col.insertOne({ ...base, waId, status: 'sent' });
    return { waId };
  } catch (e) {
    await col.insertOne({ ...base, waId: null, status: 'failed', error: (e as Error).message });
    throw e;
  }
}

/* ---------- Webhook: replies and delivery status from Meta ---------- */
export async function checkSignature(raw: string, header: string | null) {
  const s = await stored();
  if (!s.appSecretEnc) return false;
  const expected = `sha256=${createHmac('sha256', decrypt(s.appSecretEnc)).update(raw).digest('hex')}`;
  const a = Buffer.from(expected), b = Buffer.from(header ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function verifyTokenMatches(t: string | null) { return !!t && t === (await stored()).verifyToken; }

type Hook = { entry?: { changes?: { value?: {
  messages?: { from: string; id: string; timestamp: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string } }; image?: unknown; document?: { filename?: string } }[];
  statuses?: { id: string; status: string; timestamp: string; errors?: { title?: string; message?: string; error_data?: { details?: string } }[] }[];
  contacts?: { wa_id: string; profile?: { name?: string } }[];
} }[] }[] };
const ORDER = ['sent', 'delivered', 'read'];
export async function handleWebhook(payload: Hook) {
  const col = (await db()).collection('wamessages');
  for (const e of payload.entry ?? []) for (const ch of e.changes ?? []) {
    const v = ch.value ?? {};
    for (const m of v.messages ?? []) {
      if (await col.findOne({ waId: m.id })) continue; // Meta can deliver the same event twice
      const c = await contactFor(m.from);
      const body = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? (m.document ? `[Document${m.document.filename ? `: ${m.document.filename}` : ''}]` : `[${m.type}]`);
      await col.insertOne({ phone: waNumber(m.from), contactId: c ? String(c._id) : null, direction: 'in', type: m.type, body, waId: m.id, status: 'received',
        name: v.contacts?.find((x) => x.wa_id === m.from)?.profile?.name ?? '', at: new Date(Number(m.timestamp) * 1000 || Date.now()), unread: true });
    }
    for (const st of v.statuses ?? []) {
      const cur = await col.findOne({ waId: st.id });
      if (!cur) continue;
      // Statuses can arrive out of order: never step back from read to delivered.
      if (st.status === 'failed') {
        const er = st.errors?.[0];
        await col.updateOne({ _id: cur._id }, { $set: { status: 'failed', error: er?.error_data?.details || er?.message || er?.title || 'Not delivered' } });
      } else if (ORDER.indexOf(st.status) > ORDER.indexOf(String(cur.status))) {
        await col.updateOne({ _id: cur._id }, { $set: { status: st.status, [`${st.status}At`]: new Date(Number(st.timestamp) * 1000 || Date.now()) } });
      }
    }
  }
}

/** Conversations for the inbox: the latest message per number, with unread counts and the linked contact. */
export async function conversations() {
  const d = await db();
  const rows = await d.collection('wamessages').aggregate([
    { $sort: { at: -1 } },
    { $group: { _id: '$phone', last: { $first: '$$ROOT' }, unread: { $sum: { $cond: ['$unread', 1, 0] } }, contactId: { $max: '$contactId' }, name: { $max: '$name' } } },
    { $sort: { 'last.at': -1 } }, { $limit: 200 },
  ]).toArray();
  const ids = rows.map((r) => r.contactId).filter((x) => x && ObjectId.isValid(x)).map((x) => new ObjectId(String(x)));
  const cs = ids.length ? await d.collection('contacts').find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray() : [];
  return rows.map((r) => ({
    phone: String(r._id), contactId: r.contactId ? String(r.contactId) : '', name: String(cs.find((c) => String(c._id) === String(r.contactId))?.name ?? r.name ?? ''),
    last: String(r.last.body).slice(0, 90), at: (r.last.at as Date).toISOString(), direction: String(r.last.direction), unread: Number(r.unread),
  }));
}
export async function thread(phone: string) {
  const col = (await db()).collection('wamessages');
  const p = waNumber(phone);
  await col.updateMany({ phone: p, unread: true }, { $set: { unread: false } });
  const list = await col.find({ phone: p }).sort({ at: 1 }).limit(500).toArray();
  const lastIn = [...list].reverse().find((m) => m.direction === 'in');
  const link = await (await db()).collection('waleads').findOne({ phone: p });
  const lead = link ? await (await db()).collection('leads').findOne({ _id: link.leadId }, { projection: { ref: 1, title: 1 } }) : null;
  return {
    lead: lead ? { id: String(lead._id), ref: String(lead.ref ?? ''), title: String(lead.title) } : null,
    messages: list.map((m) => ({ id: String(m._id), direction: String(m.direction), body: String(m.body), at: (m.at as Date).toISOString(), status: String(m.status), error: m.error ? String(m.error) : '', by: String(m.by ?? m.name ?? ''), template: m.template ? String(m.template) : '' })),
    windowOpenUntil: lastIn ? new Date((lastIn.at as Date).getTime() + 24 * 3600e3).toISOString() : '',
  };
}
