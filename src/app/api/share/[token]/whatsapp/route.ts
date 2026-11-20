import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { findShare } from '@/lib/shares';
import { loadDoc } from '@/lib/printdocs';
import { getCompany } from '@/lib/queries';
import { getWaSettings, sendTemplate, WaError } from '@/lib/whatsapp';
import { logActivity, type ActivityModel } from '@/lib/activity';

/** Sends a shared document on WhatsApp from your business number, with the template chosen for documents. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const s = await findShare((await params).token);
    if (!s) throw new HttpError(404, 'This link has expired or was cancelled. Create a new one.');
    const { to } = z.object({ to: z.string().min(6, 'Enter the WhatsApp number with its country code.') }).parse(await req.json());
    const w = await getWaSettings();
    if (!w.enabled || !w.events.share.template) throw new HttpError(400, 'Choose the template for documents under Settings → WhatsApp first.');
    const doc = await loadDoc(s.kind, s.id, s.pid ?? undefined, { prices: s.prices });
    if (!doc) throw new HttpError(404, 'Document not found.');
    try {
      await sendTemplate({ to, template: w.events.share.template, language: w.events.share.language, urlSuffix: s._id, by: user.name, ref: { model: s.model, id: s.recordId },
        params: [doc.party?.name?.split(' ')[0] || doc.party?.name || 'there', `${doc.title} ${doc.number}`, (await getCompany()).name] });
    } catch (e) { if (e instanceof WaError) throw new HttpError(e.local ? 400 : 502, e.message); throw e; }
    await logActivity(s.model as ActivityModel, s.recordId, user.name, `Sent on WhatsApp to ${to} from the ERP.`);
    return { ok: true };
  });
}
