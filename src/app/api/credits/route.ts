import { handle, requireUser } from '@/lib/api';
import { listCredits } from '@/lib/credits';

/** Credit notes, for a document (?docId=), a partner (?partnerId=) or a side (?side=customer|supplier). */
export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    const q = new URL(req.url).searchParams;
    return listCredits({ docId: q.get('docId') ?? undefined, partnerId: q.get('partnerId') ?? undefined, side: (q.get('side') as 'customer' | 'supplier') || undefined });
  });
}
