import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { findShare, revokeShare } from '@/lib/shares';
import { logActivity, type ActivityModel } from '@/lib/activity';

type Ctx = { params: Promise<{ token: string }> };

/** Notes on the record that the link was handed to the email app or WhatsApp. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const s = await findShare((await params).token);
    if (!s) throw new HttpError(404, 'This link has expired or was cancelled.');
    const { channel, to } = z.object({ channel: z.enum(['email', 'whatsapp', 'copy']), to: z.string().max(200).default('') }).parse(await req.json());
    const how = channel === 'email' ? `Opened in the email app${to ? ` for ${to}` : ''}` : channel === 'whatsapp' ? `Opened in WhatsApp${to ? ` for ${to}` : ''}` : 'Link copied';
    await logActivity(s.model as ActivityModel, s.recordId, user.name, `${how} to share the document.`);
    return { ok: true };
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const s = await findShare((await params).token);
    if (!s) throw new HttpError(404, 'This link has already expired or was cancelled.');
    await revokeShare(s._id);
    await logActivity(s.model as ActivityModel, s.recordId, user.name, 'Share link cancelled. It no longer opens.');
    return { ok: true };
  });
}
