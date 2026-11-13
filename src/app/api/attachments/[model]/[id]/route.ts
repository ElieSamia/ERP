import { handle, requireUser } from '@/lib/api';
import { attach, attachModel, readForm } from '@/lib/attachments';

/** POST a file (multipart form: file, kind, traveller) to a booking, purchase order or expense. */
export async function POST(req: Request, { params }: { params: Promise<{ model: string; id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { model, id } = await params;
    return attach(attachModel(model), id, await readForm(req), user.name);
  });
}
