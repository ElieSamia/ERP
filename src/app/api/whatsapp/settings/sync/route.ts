import { handle, HttpError, requireUser } from '@/lib/api';
import { getWaSettings, syncTemplates, WaError } from '@/lib/whatsapp';

export async function POST() {
  return handle(async () => {
    await requireUser('admin');
    try { await syncTemplates(); return getWaSettings(); } catch (e) { if (e instanceof WaError) throw new HttpError(e.local ? 400 : 502, e.message); throw e; }
  });
}
