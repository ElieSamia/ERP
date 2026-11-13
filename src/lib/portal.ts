import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { ObjectId, type Document, type WithId } from 'mongodb';
import { db } from './db';
import { HttpError, oid } from './api';
import { PORTAL_COOKIE, SESSION_HOURS, signPortal } from './session-token';
import {
  BUILTIN_ROLES, DEFAULT_PORTAL, REQ_TO_STAGE, TRAVEL_DOC_KINDS, label, LEAD_STAGES, todayISO, travList,
  type Perms, type PortalRole, type PortalSettings, type RequestStatus,
} from './constants';
import { publicDocs } from './attachments';
import { logActivity } from './activity';
import { channelRate, getBooking, nextBookingRef } from './bookings';
import type { Booking, BookingDoc, PortalAccountUser, Request } from './types';

/* ---------- Roles and settings ---------- */
export async function getRoles(): Promise<PortalRole[]> {
  const custom = await (await db()).collection('portalRoles').find({}).sort({ name: 1 }).toArray();
  return [...BUILTIN_ROLES, ...custom.map((r) => ({ id: String(r._id), name: String(r.name), desc: String(r.desc || ''), builtin: false, perms: r.perms as Perms }))];
}
export async function getPortalSettings(): Promise<PortalSettings> {
  const d = await (await db()).collection<{ _id: string } & Partial<PortalSettings>>('settings').findOne({ _id: 'portal' });
  const { _id, ...rest } = d ?? { _id: '' };
  void _id;
  return { ...DEFAULT_PORTAL, ...rest };
}

/* ---------- Tokens, invitations and sign-in protection ---------- */
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
/** Invitation links carry a random token; only its hash is stored, so a database leak doesn't reveal working links. */
export function newInvite(days = 7) {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: hashToken(token), expires: new Date(Date.now() + days * 86400000) };
}
export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;
/** After 5 wrong passwords in a row, an account is locked for 15 minutes. */
export async function recordLogin(collection: string, user: WithId<Document>, ok: boolean) {
  const col = (await db()).collection(collection);
  if (ok) return col.updateOne({ _id: user._id }, { $set: { lastLogin: new Date(), failedLogins: 0 }, $unset: { lockedUntil: '' } });
  const fails = (Number(user.failedLogins) || 0) + 1;
  const set: Record<string, unknown> = { failedLogins: fails };
  if (fails >= MAX_FAILS) { set.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000); set.failedLogins = 0; }
  return col.updateOne({ _id: user._id }, { $set: set });
}
export const isLocked = (u: Document) => u.lockedUntil instanceof Date && u.lockedUntil > new Date();

/* ---------- Portal sessions ---------- */
export async function createPortalSession(u: { id: string; name: string; email: string; contactId: string }) {
  const token = await signPortal({ sub: u.id, name: u.name, email: u.email, contactId: u.contactId });
  (await cookies()).set(PORTAL_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_HOURS * 3600 });
}
export async function destroyPortalSession() { (await cookies()).delete(PORTAL_COOKIE); }

export type PortalCtx = { userId: string; name: string; email: string; contactId: string; contactName: string; contactType: string; role: PortalRole; perms: Perms };

/**
 * Who is signed in to the portal, re-read from the database on every request, so deactivating a user, changing
 * their role or switching off the account's portal access takes effect at once.
 */
export async function getPortalCtx(): Promise<PortalCtx | null> {
  const { verifyPortal } = await import('./session-token');
  const s = await verifyPortal((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!s || !ObjectId.isValid(s.sub)) return null;
  const d = await db();
  const u = await d.collection('portalUsers').findOne({ _id: new ObjectId(s.sub) });
  if (!u || !u.active || !u.passwordHash) return null;
  const c = await d.collection('contacts').findOne({ _id: oid(String(u.contactId)) });
  if (!c || c.portalAccess !== 'yes') return null;
  const roles = await getRoles();
  const role = roles.find((r) => r.id === u.roleId) ?? BUILTIN_ROLES.find((r) => r.id === 'viewer')!;
  return { userId: String(u._id), name: String(u.name), email: String(u.email), contactId: String(c._id), contactName: String(c.name), contactType: String(c.type), role, perms: role.perms };
}
export async function requirePortal(check?: (p: Perms) => boolean): Promise<PortalCtx> {
  const ctx = await getPortalCtx();
  if (!ctx) throw new HttpError(401, 'Your session has ended. Sign in again.');
  if (check && !check(ctx.perms)) throw new HttpError(403, 'Your access doesn’t include this. Ask your account admin.');
  return ctx;
}

export const toPortalUser = (u: WithId<Document>): PortalAccountUser => ({
  id: String(u._id), contactId: String(u.contactId), name: String(u.name), email: String(u.email), roleId: String(u.roleId),
  active: !!u.active, invited: !u.passwordHash, lastLogin: u.lastLogin instanceof Date ? u.lastLogin.toISOString() : undefined,
});
export async function listPortalUsers(contactId: string) {
  return (await (await db()).collection('portalUsers').find({ contactId }).sort({ name: 1 }).toArray()).map(toPortalUser);
}

/* ---------- Requests ---------- */
export const toRequest = (r: WithId<Document>): Request => ({
  id: String(r._id), ref: String(r.ref), contactId: String(r.contactId), createdById: String(r.createdById || ''), createdBy: String(r.createdBy || ''),
  type: r.type, title: String(r.title), destination: String(r.destination || ''), dateFrom: String(r.dateFrom || ''), dateTo: String(r.dateTo || ''),
  adults: Number(r.adults) || 0, children: Number(r.children) || 0, budget: Number(r.budget) || 0, travellers: String(r.travellers || ''), details: String(r.details || ''),
  status: r.status, quote: r.quote ?? null, approvalBy: r.approvalBy || undefined, bookingId: r.bookingId || undefined, leadId: r.leadId || undefined,
  messages: ((r.messages as { at: unknown; by: string; side: 'customer' | 'staff' | 'system'; text: string }[]) || []).map((m) => ({ ...m, at: m.at instanceof Date ? m.at.toISOString() : String(m.at) })),
  docs: publicDocs(r.docs), createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
});

export async function nextRequestRef() {
  const r = await (await db()).collection<{ _id: string; seq: number }>('counters').findOneAndUpdate({ _id: 'request' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return `RQ-${String(r?.seq ?? 1).padStart(4, '0')}`;
}

export async function getRequestDoc(id: string) {
  if (!ObjectId.isValid(id)) return null;
  return (await db()).collection('requests').findOne({ _id: new ObjectId(id) });
}
export async function requestWithNames(r: Request) {
  const d = await db();
  const [c, b] = await Promise.all([
    d.collection('contacts').findOne({ _id: oid(r.contactId) }, { projection: { name: 1 } }),
    r.bookingId && ObjectId.isValid(r.bookingId) ? d.collection('bookings').findOne({ _id: new ObjectId(r.bookingId) }, { projection: { ref: 1 } }) : null,
  ]);
  return { ...r, contactName: c ? String(c.name) : 'Unknown customer', bookingRef: b ? String(b.ref) : undefined };
}

/** Adds a line to a request's conversation. System lines record status changes the customer should see. */
export async function addMessage(id: string, side: 'customer' | 'staff' | 'system', by: string, text: string) {
  await (await db()).collection('requests').updateOne({ _id: oid(id) }, { $push: { messages: { at: new Date(), by, side, text } } } as never);
}

/** Moves the linked CRM opportunity to the stage that matches the request. */
export async function syncLead(id: string, by: string) {
  const d = await db();
  const r = await d.collection('requests').findOne({ _id: oid(id) });
  if (!r?.leadId || !ObjectId.isValid(String(r.leadId))) return;
  const stage = REQ_TO_STAGE[r.status as RequestStatus];
  const lead = await d.collection('leads').findOne({ _id: new ObjectId(String(r.leadId)) });
  if (!lead) return;
  const set: Record<string, unknown> = {};
  if (lead.stage !== stage) set.stage = stage;
  if (r.bookingId && lead.bookingId !== r.bookingId) set.bookingId = r.bookingId;
  if (r.quote && Number(lead.budget) !== Number(r.quote.amount)) set.budget = Number(r.quote.amount);
  if (!Object.keys(set).length) return;
  await d.collection('leads').updateOne({ _id: lead._id }, { $set: set });
  if (set.stage) await logActivity('lead', String(lead._id), by, `Stage set to ${label(LEAD_STAGES, stage)} by portal request ${r.ref}.`);
}

/** Every request from the portal also appears in the CRM pipeline. */
export async function leadFromRequest(id: string, by: string) {
  const d = await db();
  const r = await d.collection('requests').findOne({ _id: oid(id) });
  if (!r || r.leadId) return;
  const l = await d.collection('leads').insertOne({
    title: String(r.title), contactId: String(r.contactId), stage: 'new', destination: String(r.destination || ''), travelDate: String(r.dateFrom || ''),
    pax: (Number(r.adults) || 0) + (Number(r.children) || 0), budget: Number(r.budget) || 0, notes: `Portal request ${r.ref}.${r.details ? '\n' + r.details : ''}`,
    requestId: id, createdAt: new Date(), createdBy: 'Portal',
  });
  await d.collection('requests').updateOne({ _id: r._id }, { $set: { leadId: String(l.insertedId) } });
  await logActivity('lead', String(l.insertedId), by, `Created from portal request ${r.ref}.`);
}

/** Turns a request into a draft booking. The agreed price goes on the first service; staff then add suppliers and confirm. */
export async function bookFromRequest(id: string, by: string) {
  const d = await db();
  const r = await d.collection('requests').findOne({ _id: oid(id) });
  if (!r) throw new HttpError(404, 'Request not found.');
  if (r.bookingId) return String(r.bookingId);
  const c = await d.collection('contacts').findOne({ _id: oid(String(r.contactId)) });
  const { markup, markupType } = await channelRate(String(c?.type || 'customer'));
  const price = r.quote ? Number(r.quote.amount) || 0 : 0;
  const cost = !price ? 0 : markupType === 'amount' ? Math.max(0, Math.round((price - markup) * 100) / 100) : Math.round((price / (1 + markup / 100)) * 100) / 100;
  const tripType = ['visa', 'insurance'].includes(r.type) ? 'service' : r.dateTo ? 'return' : 'oneway';
  const ref = await nextBookingRef();
  const notes = [`From portal request ${r.ref}: ${r.title}`, `Travellers: ${r.adults} adult${Number(r.adults) === 1 ? '' : 's'}${Number(r.children) ? `, ${r.children} children` : ''}`,
    price ? `Price agreed: $${price.toFixed(2)}. Enter the real supplier costs and keep the total at the agreed price.` : '', r.details ? `\nRequest details:\n${r.details}` : '',
    (r.docs || []).length ? `\nThe customer attached ${(r.docs || []).length} document(s) to request ${r.ref}.` : ''].filter(Boolean).join('\n');
  const b = await d.collection('bookings').insertOne({
    ref, contactId: String(r.contactId), tripType, bookingDate: todayISO(), origin: 'BEY', destination: '', destinationName: String(r.destination || ''),
    departDate: tripType === 'service' ? '' : String(r.dateFrom || ''), returnDate: tripType === 'return' ? String(r.dateTo || '') : '', travellers: String(r.travellers || ''),
    tripNotes: '', notes, lines: [{ id: randomBytes(8).toString('hex'), type: r.type === 'other' ? 'package' : r.type, desc: String(r.title), date: String(r.dateFrom || ''), dateTo: String(r.dateTo || ''), supplierId: '', cost, markup, markupType }],
    docs: [], status: 'draft', leadId: r.leadId || undefined, requestId: id, createdAt: new Date(), createdBy: by,
  });
  const bid = String(b.insertedId);
  await d.collection('requests').updateOne({ _id: r._id }, { $set: { status: 'booked', bookingId: bid } });
  await addMessage(id, 'system', '', `Booking ${ref} created. You can follow it under Bookings; the confirmation appears there once it’s confirmed.`);
  await logActivity('booking', bid, by, `Booking ${ref} created from portal request ${r.ref}.`);
  await syncLead(id, by);
  return bid;
}

/**
 * Moving a portal opportunity in the CRM moves its request too, so both always agree:
 * New reopens it, Qualified starts the review, Quote sent re-sends a valid quote, Won books it, Lost declines it.
 */
export async function requestFromStage(leadId: string, requestId: string, stage: string, by: string) {
  const r = await getRequestDoc(requestId);
  if (!r) return;
  const col = (await db()).collection('requests');
  if (r.status === 'booked' && stage !== 'won') throw new HttpError(409, 'This deal already has a booking. Cancel the booking first if the deal is off.');
  if (stage === 'new' || stage === 'qualified') {
    const reopened = ['declined', 'cancelled'].includes(r.status);
    await col.updateOne({ _id: r._id }, { $set: { status: stage === 'new' ? 'submitted' : 'review' } });
    await addMessage(requestId, 'system', '', reopened ? 'Request reopened by our team.' : stage === 'new' ? 'Request moved back to submitted.' : 'Our team is reviewing your request.');
  } else if (stage === 'quoted') {
    if (!r.quote || r.quote.validUntil < todayISO()) throw new HttpError(409, 'Send the quote from the portal request so you can enter the price.');
    await col.updateOne({ _id: r._id }, { $set: { status: 'quoted' } });
    await addMessage(requestId, 'system', '', 'Quote sent again.');
  } else if (stage === 'won') {
    if (r.status !== 'accepted' && r.status !== 'booked') await addMessage(requestId, 'system', '', 'Confirmed by our team.');
    await bookFromRequest(requestId, by);
  } else if (stage === 'lost') {
    await col.updateOne({ _id: r._id }, { $set: { status: 'declined' } });
    await addMessage(requestId, 'system', '', 'Request declined by our team. Send us a message if you’d like to discuss it.');
  }
  await logActivity('request', requestId, by, `Updated from the CRM opportunity.`);
  void leadId;
  await syncLead(requestId, by);
}

/* ---------- What a portal user can see ---------- */
export async function visibleRequests(ctx: PortalCtx) {
  if (ctx.perms.requests === 'none') return [];
  const f: Record<string, unknown> = { contactId: ctx.contactId };
  if (ctx.perms.scope === 'own') f.createdById = ctx.userId;
  return (await (await db()).collection('requests').find(f).sort({ createdAt: -1 }).limit(300).toArray()).map(toRequest);
}
export async function visibleBookings(ctx: PortalCtx): Promise<Booking[]> {
  if (ctx.perms.bookings === 'none') return [];
  const d = await db();
  const list = await d.collection('bookings').find({ contactId: ctx.contactId }).sort({ createdAt: -1 }).limit(300).toArray();
  let ids = list.map((b) => String(b._id));
  if (ctx.perms.bookings === 'travelling') {
    const me = ctx.name.trim().toLowerCase();
    ids = list.filter((b) => travList(String(b.travellers || '')).some((t) => t.toLowerCase() === me)).map((b) => String(b._id));
  } else if (ctx.perms.scope === 'own') {
    const mine = await d.collection('requests').find({ contactId: ctx.contactId, createdById: ctx.userId, bookingId: { $exists: true } }, { projection: { bookingId: 1 } }).toArray();
    const set = new Set(mine.map((r) => String(r.bookingId)));
    ids = ids.filter((x) => set.has(x));
  }
  const out: Booking[] = [];
  for (const id of ids) { const b = await getBooking(id); if (b) out.push(b); }
  return out;
}
export async function canSeeBooking(ctx: PortalCtx, id: string) {
  return (await visibleBookings(ctx)).find((b) => b.id === id) ?? null;
}
/** Travel documents are visible to anyone who sees the booking; passports and the like follow the role. Travellers see only their own. */
export function portalDocs(ctx: PortalCtx, docs: BookingDoc[]) {
  const me = ctx.name.trim().toLowerCase();
  return docs.filter((d) => d.shared !== 'no'
    && (TRAVEL_DOC_KINDS.includes(d.kind) || ctx.perms.documents !== 'none')
    && (ctx.perms.bookings !== 'travelling' || !d.traveller || d.traveller.toLowerCase() === me));
}

/* ---------- Validation and invitations, shared by staff and portal routes ---------- */
const perms = z.object({
  requests: z.enum(['none', 'view', 'create']), scope: z.enum(['account', 'own']), acceptQuotes: z.enum(['yes', 'no']),
  approvalLimit: z.coerce.number().min(0).max(10000000), approveQuotes: z.enum(['yes', 'no']), bookings: z.enum(['none', 'travelling', 'view']),
  prices: z.enum(['yes', 'no']), documents: z.enum(['none', 'view', 'upload']), invoices: z.enum(['yes', 'no']), statement: z.enum(['yes', 'no']), manageUsers: z.enum(['yes', 'no']),
});
export const roleSchema = z.object({ name: z.string().trim().min(1, 'Name the role.').max(60), desc: z.string().trim().max(300).default(''), perms });


export const inviteSchema = z.object({
  name: z.string().trim().min(1, 'Enter the person’s name.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  roleId: z.string().min(1, 'Choose a role.'),
});

/** Creates an invited portal user and returns the link to send them; they set their own password from it. */
export async function inviteUser(contactId: string, data: z.infer<typeof inviteSchema>, origin: string, by: string) {
  const d = await db();
  const c = await d.collection('contacts').findOne({ _id: oid(contactId) });
  if (!c || c.type === 'supplier') throw new HttpError(400, 'Portal users for suppliers come in the next part. Choose a customer account.');
  if (!(await getRoles()).some((r) => r.id === data.roleId)) throw new HttpError(400, 'Choose a role.');
  if (await d.collection('portalUsers').findOne({ email: data.email })) throw new HttpError(409, 'A portal user with this email already exists.');
  const inv = newInvite();
  await d.collection('portalUsers').insertOne({ ...data, contactId, active: true, passwordHash: null, inviteHash: inv.hash, inviteExpires: inv.expires, createdAt: new Date(), createdBy: by });
  await logActivity('contact', contactId, by, `Portal user ${data.name} invited.`);
  return { users: await listPortalUsers(contactId), inviteUrl: `${origin}/portal/invite/${inv.token}` };
}

