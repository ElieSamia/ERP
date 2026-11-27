import { handle, HttpError, requireUser } from '@/lib/api';
import { readFile } from '@/lib/importer';

export const maxDuration = 60;

/** Reads the uploaded file and suggests which column is which. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const form = await req.formData().catch(() => { throw new HttpError(400, 'Send the file as an upload.'); });
    const f = form.get('file');
    if (!(f instanceof File)) throw new HttpError(400, 'Choose the file to import.');
    return readFile(f.name, Buffer.from(await f.arrayBuffer()), user.name);
  });
}
