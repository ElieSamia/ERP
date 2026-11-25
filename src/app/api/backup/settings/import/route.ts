import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { importSettings, readSettingsFile } from '@/lib/settingsio';

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser('admin');
    const { file, sections } = z.object({ file: z.string().min(10, 'That file isn’t a settings export.'), sections: z.array(z.string()).min(1, 'Choose at least one section.') }).parse(await req.json());
    return importSettings(readSettingsFile(file), sections, user.email);
  });
}
