import { after } from 'next/server';
import { ObjectId } from 'mongodb';
import { db } from './db';
import { createShare } from './shares';
import { loadDoc } from './printdocs';
import { getCompany } from './queries';
import { getWaSettings, sendTemplate, validWaNumber, type WaEvent } from './whatsapp';
import { logActivity, type ActivityModel } from './activity';
import type { DocKind } from './constants';

/**
 * Automatic WhatsApp messages for the events switched on in Settings → WhatsApp. They go to the contact's phone,
 * with a secure link to the document. Like emails, they run after the response, so a WhatsApp problem never
 * blocks the action, and every attempt (sent or failed) is in the WhatsApp inbox.
 */
export function waNotify(ev: WaEvent, o: { contactId: string; kind: DocKind; id: string; pid?: string; model: ActivityModel; recordId: string; by: string }) {
  try {
    after(async () => {
      try {
        const w = await getWaSettings();
        const cfg = w.events[ev];
        if (!w.enabled || !cfg?.on || !cfg.template || !ObjectId.isValid(o.contactId)) return;
        const c = await (await db()).collection('contacts').findOne({ _id: new ObjectId(o.contactId) }, { projection: { phone: 1, name: 1 } });
        if (!c?.phone || !validWaNumber(String(c.phone))) return;
        const doc = await loadDoc(o.kind, o.id, o.pid);
        if (!doc) return;
        const { token } = await createShare({ kind: o.kind, id: o.id, pid: o.pid ?? null, prices: false, model: o.model, recordId: o.recordId, createdBy: o.by });
        await sendTemplate({ to: String(c.phone), template: cfg.template, language: cfg.language, urlSuffix: token, by: `${o.by} (automatic)`, ref: { model: o.model, id: o.recordId },
          params: [String(c.name).split(' ')[0], `${doc.title} ${doc.number}`, (await getCompany()).name] });
        await logActivity(o.model, o.recordId, o.by, `Sent on WhatsApp automatically to ${c.phone}.`);
      } catch (e) { console.error('WhatsApp notification failed', (e as Error).message); }
    });
  } catch { /* outside a request */ }
}
