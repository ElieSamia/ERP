import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { loadDoc, DOC_KIND_NAMES } from '@/lib/printdocs';
import { createShare } from '@/lib/shares';
import { getCompany } from '@/lib/queries';
import { logActivity } from '@/lib/activity';
import { fmtDate } from '@/lib/constants';

const schema = z.object({
  kind: z.enum(['confirm', 'vouchers', 'invoice', 'receipt', 'po', 'voucher']),
  id: z.string().min(1),
  pid: z.string().optional(),
  prices: z.boolean().optional(),
});

/** Creates a link the customer or supplier can open without an account. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.parse(await req.json());
    const doc = await loadDoc(b.kind, b.id, b.pid, { prices: b.prices });
    if (!doc) throw new HttpError(404, 'Document not found.');
    const { token, expiresAt } = await createShare({ kind: b.kind, id: b.id, pid: b.pid ?? null, prices: !!b.prices, model: doc.model, recordId: doc.recordId, createdBy: user.name });
    const until = fmtDate(expiresAt.toISOString().slice(0, 10));
    await logActivity(doc.model, doc.recordId, user.name, `Share link created for the ${DOC_KIND_NAMES[b.kind]} ${doc.number}, valid until ${until}.`);
    const company = await getCompany();
    return {
      url: `${new URL(req.url).origin}/s/${token}`, token, until, title: doc.title, number: doc.number, company: company.name,
      party: { name: doc.party?.name ?? '', email: doc.party?.email ?? '', phone: doc.party?.phone ?? '' },
    };
  });
}
