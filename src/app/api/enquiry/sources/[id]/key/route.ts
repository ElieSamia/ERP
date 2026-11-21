import { handle, requireUser } from '@/lib/api';
import { listSources, rotateKey } from '@/lib/enquiries';

/** Replaces the key at once (the old one stops working); the new key is shown only in this answer. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => { await requireUser('admin'); const k = await rotateKey((await params).id); return { ...(await listSources()), newKey: k }; });
}
