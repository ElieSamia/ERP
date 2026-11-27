import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { runImport } from '@/lib/importer';
import { audit } from '@/lib/audit';

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = z.object({
      token: z.string().min(1), mapping: z.record(z.string(), z.number().int()),
      defaultType: z.enum(['customer', 'agency', 'corporate', 'supplier']), onDuplicate: z.enum(['skip', 'update']),
    }).parse(await req.json());
    const r = await runImport(b.token, b.mapping, b.defaultType, b.onDuplicate, user.name);
    await audit({ kind: 'settings', action: 'Contacts imported', who: user.name, whoId: user.sub, detail: `${r.created} created, ${r.updated} updated, ${r.skipped} duplicates skipped, ${r.problems.length} rows with problems` });
    return r;
  });
}
