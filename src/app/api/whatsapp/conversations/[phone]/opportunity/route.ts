import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { waNumber } from '@/lib/whatsapp';
import { contactFor, intake, nextLeadRef, requestSchema } from '@/lib/enquiries';
import { parseWa } from '@/lib/waparse';
import { logActivity } from '@/lib/activity';

/**
 * Turns a WhatsApp chat into an opportunity. If the chat quotes a website request ID the ERP already has, the chat
 * is linked to that opportunity instead. A package message fills in every field; a service or destination
 * message gives the title; anything else becomes a plain WhatsApp enquiry with the chat in the notes.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ phone: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const phone = waNumber((await params).phone);
    const d = await db();
    const msgs = await d.collection('wamessages').find({ phone }).sort({ at: 1 }).limit(200).toArray();
    const inbound = msgs.filter((m) => m.direction === 'in');
    if (!inbound.length) throw new HttpError(400, 'This customer hasn’t written yet, so there’s nothing to turn into an opportunity.');
    const linked = await d.collection('waleads').findOne({ phone });
    if (linked) { const l = await d.collection('leads').findOne({ _id: linked.leadId }); if (l) return { id: String(l._id), ref: String(l.ref ?? ''), linked: true }; }
    const text = inbound.map((m) => String(m.body)).join('\n\n');
    const p = parseWa(text);
    const profile = String(inbound.at(-1)?.name ?? '');
    const transcript = msgs.slice(-20).map((m) => `${m.direction === 'in' ? (profile || 'Customer') : (m.by || 'Us')}: ${m.body}`).join('\n');
    // The website already sent this request? Link the chat to it.
    if (p.requestId) {
      const l = await d.collection('leads').findOne({ 'enquiry.requestId': p.requestId });
      if (l) {
        await d.collection('waleads').updateOne({ phone }, { $set: { phone, leadId: l._id, at: new Date() } }, { upsert: true });
        await logActivity('lead', String(l._id), user.name, `WhatsApp chat with +${phone} linked (request ${p.requestId}).`);
        return { id: String(l._id), ref: String(l.ref ?? ''), linked: true };
      }
    }
    let out: { id: string; ref: string };
    if (p.kind === 'package' && p.requestId) {
      const f = p.fields;
      const r = requestSchema.parse({
        requestId: p.requestId, formType: 'package', channel: 'whatsapp', fullName: f.fullName || profile || `+${phone}`, email: f.email ?? '', phone: f.phone || `+${phone}`,
        packageName: f.packageName ?? '', departureDate: f.departureDate ?? '', numberOfNights: f.numberOfNights ?? 0, adults: f.adults ?? 0, children: f.children ?? 0,
        departureCity: f.departureCity ?? '', roomType: f.roomType ?? '', notes: f.notes ?? '', page: { type: 'package', name: f.packageName ?? '' },
      });
      const src = await d.collection('enqsources').findOne({ name: 'Website' });
      out = await intake(r, { id: src ? String(src._id) : 'whatsapp', name: 'Website' }, `${user.name} (WhatsApp)`);
    } else {
      const { contact } = await contactFor(p.fields.fullName || profile || `+${phone}`, p.fields.email ?? '', `+${phone}`, false, 'WhatsApp');
      const title = p.kind === 'service' ? `WhatsApp: ${p.topic}` : p.kind === 'destination' ? `WhatsApp: trip to ${p.topic}` : `WhatsApp enquiry from ${contact.name}`;
      const ref = await nextLeadRef();
      const ins = await d.collection('leads').insertOne({
        ref, title, contactId: String(contact._id), stage: 'new', destination: p.kind === 'destination' ? p.topic : '', travelDate: '', pax: 0, budget: 0,
        notes: `WhatsApp chat with +${phone}${p.requestId ? `, request ${p.requestId}` : ''}\n\n${transcript}`, source: 'WhatsApp', createdAt: new Date(), createdBy: user.name,
      });
      out = { id: String(ins.insertedId), ref };
      await logActivity('lead', out.id, user.name, `Opportunity ${ref} created from a WhatsApp chat with +${phone}.`);
    }
    await d.collection('waleads').updateOne({ phone }, { $set: { phone, leadId: new (await import('mongodb')).ObjectId(out.id), at: new Date() } }, { upsert: true });
    return { ...out, linked: false };
  });
}
