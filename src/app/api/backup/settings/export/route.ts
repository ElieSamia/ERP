import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { exportSettings } from '@/lib/settingsio';

/** Downloads the chosen settings as one file. */
export async function POST(req: Request) {
  const user = await requireUser('admin').catch(() => null);
  if (!user) return handle(async () => { await requireUser('admin'); });
  const { sections } = z.object({ sections: z.array(z.string()).min(1, 'Choose at least one section.') }).parse(await req.json());
  const text = await exportSettings(sections, user.name);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="erp-settings-${day}.json"`, 'Cache-Control': 'no-store' } });
}
