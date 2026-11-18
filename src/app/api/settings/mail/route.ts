import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { getMailSettings, recentEmails, saveMailSettings } from '@/lib/mail';

const emails = z.string().trim().max(500).refine((v) => !v || v.split(/[,;\s]+/).filter(Boolean).every((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)), 'Check the email addresses.');
const schema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(200).regex(/^[a-z0-9.-]*$/i, 'Enter a server name like smtppro.zoho.com.'),
  port: z.coerce.number().int().refine((p) => [25, 465, 587, 2525].includes(p), 'Use port 465 or 587.'),
  secure: z.boolean(),
  user: z.string().trim().max(200),
  password: z.string().max(300).optional(),
  fromName: z.string().trim().max(100),
  fromEmail: z.string().trim().max(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Check the sending address.'),
  replyTo: emails, notifyTo: emails,
  appUrl: z.string().trim().max(200).refine((v) => !v || /^https?:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(v), 'Use an address like https://erp.thetravelconsult.com'),
}).refine((s) => !s.enabled || (s.host && s.user && s.fromEmail), { message: 'Fill in the server, username and sending address before turning sending on.' });

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const failed = new URL(req.url).searchParams.get('failed') === '1';
    return { settings: await getMailSettings(), log: await recentEmails(25, failed) };
  });
}

/** Saves the mail settings. An empty password keeps the saved one; it's never sent back to the browser. */
export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const data = schema.parse(await req.json());
    const cur = await getMailSettings();
    if (data.enabled && !data.password && !cur.hasPassword) throw new (await import('@/lib/api')).HttpError(400, 'Enter the password (a Zoho application-specific password) before turning sending on.');
    // Links in notification emails need a full address. Without one set, and outside Vercel, use the one in use now.
    if (!data.appUrl && !process.env.VERCEL_PROJECT_PRODUCTION_URL) data.appUrl = new URL(req.url).origin;
    await saveMailSettings({ ...data, password: data.password || undefined });
    return { settings: await getMailSettings(), log: await recentEmails() };
  });
}
