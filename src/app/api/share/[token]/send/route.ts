import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { findShare } from '@/lib/shares';
import { layout, sendMail } from '@/lib/mail';
import { logActivity, type ActivityModel } from '@/lib/activity';

const schema = z.object({
  to: z.string().trim().min(3).max(500),
  subject: z.string().trim().min(1, 'Add a subject.').max(200),
  body: z.string().trim().min(1, 'Write a message.').max(8000),
});

/** Sends a shared document's link from your own mailbox, with the message as written in the share form. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const s = await findShare((await params).token);
    if (!s) throw new HttpError(404, 'This link has expired or was cancelled. Create a new one.');
    const { to, subject, body } = schema.parse(await req.json());
    const list = to.split(/[,;\s]+/).filter(Boolean);
    if (!list.length || list.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) throw new HttpError(400, 'Check the email address.');
    const link = `${new URL(req.url).origin}/s/${s._id}`;
    // The message already contains the link; show it as a button too, and keep the paragraphs as typed.
    // The button carries the link, so take the bare address out of the text; drop lines left empty.
    const paragraphs = body.split(/\n{2,}/)
      .map((p) => p.split('\n').map((l) => l.replace(/https?:\/\/\S+\/s\/[A-Za-z0-9_-]+/g, '').trimEnd()).filter((l) => l.trim()).join('\n').trim())
      .filter(Boolean);
    const m = await layout({ heading: subject, paragraphs, button: { text: 'Open the document', url: link } });
    const r = await sendMail({ to: list, subject, ...m, kind: `share-${s.kind}`, ref: { model: s.model, id: s.recordId } });
    if (!r.sent) throw new HttpError(502, r.error ?? 'Sending failed.');
    await logActivity(s.model as ActivityModel, s.recordId, user.name, `Emailed to ${list.join(', ')} from the ERP: “${subject}”.`);
    return { ok: true };
  });
}
