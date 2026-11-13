import { handle } from '@/lib/api';
import { destroyPortalSession } from '@/lib/portal';

export async function POST() {
  return handle(async () => { await destroyPortalSession(); return { ok: true }; });
}
