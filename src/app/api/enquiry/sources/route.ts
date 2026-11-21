import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { addSource, listSources } from '@/lib/enquiries';

export async function GET() {
  return handle(async () => { await requireUser('admin'); return listSources(); });
}
/** A new source (a partner, a lead platform): its key is shown once, in this answer. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const { name } = z.object({ name: z.string().trim().min(2, 'Name the source.').max(80) }).parse(await req.json());
    const k = await addSource(name);
    return { ...(await listSources()), newKey: k };
  });
}
