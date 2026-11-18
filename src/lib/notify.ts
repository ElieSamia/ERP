import { after } from 'next/server';
import { ObjectId } from 'mongodb';
import { db } from './db';
import { appUrl, layout, mailReady, sendMail } from './mail';
import { getRoles } from './portal';
import { fmtDate, money, type Perms } from './constants';

/**
 * Who gets emailed when something happens in the portal. Runs after the response is sent, so a slow or failing
 * mail server never delays or breaks the action itself; every attempt is in the email log in Settings.
 */
type Pick = (p: Perms, u: { id: string }) => boolean;

async function portalRecipients(contactId: string, pick: Pick) {
  const d = await db();
  const roles = await getRoles();
  const users = await d.collection('portalUsers').find({ contactId, active: { $ne: false }, passwordHash: { $type: 'string' } }).toArray();
  return users.filter((u) => { const r = roles.find((x) => x.id === u.roleId); return r && pick(r.perms, { id: String(u._id) }); }).map((u) => String(u.email));
}
async function staffRecipients() {
  const { getMailSettings } = await import('./mail');
  const s = await getMailSettings();
  return s.notifyTo.split(/[,;\s]+/).filter((x) => x.includes('@'));
}
function later(fn: () => Promise<unknown>) {
  try { after(async () => { try { if (await mailReady()) await fn(); } catch (e) { console.error('Notification failed', e); } }); }
  catch { /* outside a request (tests, scripts): skip */ }
}

/* ---------- Portal requests ---------- */
export type RequestEvent =
  | 'new' | 'staff-message' | 'quote' | 'declined-by-us' | 'booked'
  | 'customer-message' | 'cancelled' | 'quote-accepted' | 'quote-declined' | 'needs-approval' | 'approved' | 'not-approved';

export function notifyRequest(id: string, ev: RequestEvent, actor = '') {
  later(async () => {
    const d = await db();
    const r = await d.collection('requests').findOne({ _id: new ObjectId(id) });
    if (!r) return;
    const c = await d.collection('contacts').findOne({ _id: new ObjectId(String(r.contactId)) }, { projection: { name: 1 } });
    const base = await appUrl();
    const ref = `${r.ref}: ${r.title || r.destination || 'request'}`;
    const lastText = String((r.messages as { side: string; text: string }[] | undefined)?.filter((m) => m.side !== 'system').at(-1)?.text ?? '');
    const creator = (_p: Perms, u: { id: string }) => u.id === String(r.createdById);
    const toCustomer = async (pick: Pick, subject: string, paragraphs: string[]) => {
      const to = await portalRecipients(String(r.contactId), pick);
      if (!to.length) return;
      const m = await layout({ heading: subject, paragraphs, button: { text: 'Open the request', url: `${base}/portal/requests/${id}` }, footer: 'You get this email because you use our customer portal.' });
      await sendMail({ to, subject, ...m, kind: `request-${ev}`, ref: { model: 'request', id } });
    };
    const toStaff = async (subject: string, paragraphs: string[]) => {
      const to = await staffRecipients();
      if (!to.length) return;
      const m = await layout({ heading: subject, paragraphs, button: { text: 'Open in the ERP', url: `${base}/b2b/requests/${id}` } });
      await sendMail({ to, subject, ...m, kind: `request-${ev}`, ref: { model: 'request', id } });
    };
    const q = r.quote as { amount: number; validUntil: string; notes?: string } | null;
    switch (ev) {
      case 'quote': return toCustomer((p, u) => creator(p, u) || p.acceptQuotes === 'yes', `Quote for ${r.ref}: ${money(q?.amount ?? 0)}`, [
        `Your quote for ${ref} is ready: ${money(q?.amount ?? 0)}, valid until ${fmtDate(q?.validUntil ?? '')}.`, ...(q?.notes ? [q.notes] : []), 'Open the request to accept or decline it.']);
      case 'staff-message': return toCustomer(creator, `New message on ${r.ref}`, [`Our team wrote on ${ref}:`, lastText]);
      case 'declined-by-us': return toCustomer(creator, `Update on ${r.ref}`, [`We’re unable to go ahead with ${ref}.`, lastText]);
      case 'booked': return toCustomer(creator, `${r.ref} is now a booking`, [`Your request ${ref} is now a booking. Our team will confirm the services and your travel documents will appear in the portal.`]);
      case 'needs-approval': return toCustomer((p) => p.approveQuotes === 'yes', `Approval needed: ${r.ref}, ${money(q?.amount ?? 0)}`, [
        `${actor} accepted the quote for ${ref} at ${money(q?.amount ?? 0)}. It’s above their limit, so it needs your approval.`]);
      case 'not-approved': return toCustomer(creator, `${r.ref} wasn’t approved`, [`${actor} didn’t approve the quote for ${ref}.`, ...(lastText ? [lastText] : [])]);
      case 'new': return toStaff(`New portal request ${r.ref} from ${c?.name ?? 'a customer'}`, [`${r.createdBy} sent ${ref}.`, `Travel from ${fmtDate(String(r.dateFrom || ''))}${r.dateTo ? ` to ${fmtDate(String(r.dateTo))}` : ''}, ${r.adults ?? 1} adult(s)${r.budget ? `, budget ${money(Number(r.budget))}` : ''}.`]);
      case 'customer-message': return toStaff(`Message from ${c?.name ?? 'a customer'} on ${r.ref}`, [`${actor} wrote:`, lastText]);
      case 'cancelled': return toStaff(`${r.ref} withdrawn by ${c?.name ?? 'the customer'}`, [`${actor} withdrew ${ref}.`]);
      case 'quote-accepted': return toStaff(`Quote accepted: ${r.ref}, ${money(q?.amount ?? 0)}`, [`${actor} at ${c?.name ?? 'the customer'} accepted the quote for ${ref}.`, r.bookingId ? 'A draft booking was created automatically.' : 'Create the booking from the request.']);
      case 'approved': return toStaff(`Quote approved: ${r.ref}, ${money(q?.amount ?? 0)}`, [`${actor} at ${c?.name ?? 'the customer'} approved the quote for ${ref}.`, r.bookingId ? 'A draft booking was created automatically.' : 'Create the booking from the request.']);
      case 'quote-declined': return toStaff(`Quote declined: ${r.ref}`, [`${actor} at ${c?.name ?? 'the customer'} declined the quote for ${ref}.`, ...(lastText ? [lastText] : [])]);
    }
  });
}

/* ---------- Purchase orders and suppliers ---------- */
export type OrderEvent = 'sent' | 'staff-message' | 'paid' | 'cancelled' | 'supplier-confirmed' | 'supplier-message' | 'supplier-bill' | 'supplier-file';

export function notifyOrder(id: string, ev: OrderEvent, actor = '') {
  later(async () => {
    const d = await db();
    const po = await d.collection('purchases').findOne({ _id: new ObjectId(id) });
    if (!po) return;
    const s = ObjectId.isValid(String(po.supplierId)) ? await d.collection('contacts').findOne({ _id: new ObjectId(String(po.supplierId)) }, { projection: { name: 1 } }) : null;
    const base = await appUrl();
    const lastText = String((po.thread as { side: string; text: string }[] | undefined)?.filter((m) => m.side !== 'system').at(-1)?.text ?? '');
    const toSupplier = async (pick: Pick, subject: string, paragraphs: string[]) => {
      const to = await portalRecipients(String(po.supplierId), pick);
      if (!to.length) return;
      const m = await layout({ heading: subject, paragraphs, button: { text: 'Open the order', url: `${base}/portal/orders/${id}` }, footer: 'You get this email because you use our supplier portal.' });
      await sendMail({ to, subject, ...m, kind: `order-${ev}`, ref: { model: 'purchase', id } });
    };
    const toStaff = async (subject: string, paragraphs: string[]) => {
      const to = await staffRecipients();
      if (!to.length) return;
      const m = await layout({ heading: subject, paragraphs, button: { text: 'Open in the ERP', url: `${base}/purchasing/${id}` } });
      await sendMail({ to, subject, ...m, kind: `order-${ev}`, ref: { model: 'purchase', id } });
    };
    const lastPay = (po.payments as { ref: string; amount: number; date: string }[] | undefined)?.at(-1);
    switch (ev) {
      case 'sent': return toSupplier((p) => !!p.orders && p.orders !== 'none', `New purchase order ${po.ref}`, [`We’ve sent you purchase order ${po.ref}. Please check the services and confirm it in the portal.`]);
      case 'staff-message': return toSupplier((p) => !!p.orders && p.orders !== 'none', `Message on ${po.ref}`, [`Our team wrote on ${po.ref}:`, lastText]);
      case 'paid': return toSupplier((p) => p.payments === 'yes', `Payment ${lastPay?.ref ?? ''} for ${po.ref}`, [`We’ve made a payment of ${money(lastPay?.amount ?? 0)} on ${fmtDate(lastPay?.date ?? '')} for ${po.ref}. The voucher is in the portal.`]);
      case 'cancelled': return toSupplier((p) => !!p.orders && p.orders !== 'none', `${po.ref} cancelled`, [`We’ve cancelled purchase order ${po.ref}. Please release any services held for it.`]);
      case 'supplier-confirmed': return toStaff(`${s?.name ?? 'Supplier'} confirmed ${po.ref}`, [`${actor} confirmed ${po.ref}${po.supplierAck?.ref ? `, their reference ${po.supplierAck.ref}` : ''}.`]);
      case 'supplier-message': return toStaff(`Message from ${s?.name ?? 'a supplier'} on ${po.ref}`, [`${actor} wrote:`, lastText]);
      case 'supplier-bill': return toStaff(`Bill from ${s?.name ?? 'a supplier'} for ${po.ref}`, [`${actor} uploaded bill ${po.supplierBill?.ref ?? ''} for ${money(Number(po.supplierBill?.amount ?? 0))}. Check it and record it on the order.`]);
      case 'supplier-file': return toStaff(`New file from ${s?.name ?? 'a supplier'} on ${po.ref}`, [`${actor} uploaded a file on ${po.ref}. It’s under Supplier documents.`]);
    }
  });
}
