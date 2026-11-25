import { handle, requireUser } from '@/lib/api';
import { previewSettings, readSettingsFile } from '@/lib/settingsio';

/** What a settings file contains, before importing anything. */
export async function POST(req: Request) {
  return handle(async () => { await requireUser('admin'); return previewSettings(readSettingsFile(await req.text())); });
}
