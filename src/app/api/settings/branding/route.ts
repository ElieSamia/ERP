import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { getBranding } from '@/lib/branding';

const layout = z.object({
  title: z.string().trim().min(1, 'Every document needs a title.').max(60),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a colour.'),
  showLogo: z.boolean(), showTax: z.boolean(), showSigs: z.boolean(),
  sig1: z.string().trim().max(40), sig2: z.string().trim().max(40),
  note: z.string().trim().max(400), terms: z.string().trim().max(3000),
});
const schema = z.object({
  // PNG, JPEG or WebP only (no SVG, which can carry scripts), already shrunk in the browser.
  logo: z.string().max(400_000, 'That logo is too large. Use a smaller image.').refine((v) => !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), 'Use a PNG, JPG or WebP image.'),
  docs: z.record(z.enum(['confirm', 'vouchers', 'invoice', 'receipt', 'po', 'voucher', 'statement', 'supstatement', 'credit', 'refund']), layout),
});

export async function GET() {
  return handle(async () => { await requireUser('admin'); return getBranding(); });
}
export async function PUT(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const data = schema.parse(await req.json());
    await (await db()).collection<{ _id: string }>('settings').updateOne({ _id: 'branding' }, { $set: data }, { upsert: true });
    return getBranding();
  });
}
