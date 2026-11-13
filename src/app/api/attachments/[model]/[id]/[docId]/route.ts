import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { attachModel, openFile, removeDoc, setShared } from '@/lib/attachments';

type Ctx = { params: Promise<{ model: string; id: string; docId: string }> };

/** Opens the file after the sign-in check. ?download=1 saves it instead of opening it. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireUser();
    const { model, id, docId } = await params;
    return await openFile(attachModel(model), id, docId, new URL(req.url).searchParams.get('download') === '1');
  } catch (e) {
    return handle(async () => { throw e; });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { model, id, docId } = await params;
    const { shared } = z.object({ shared: z.enum(['yes', 'no']) }).parse(await req.json());
    return setShared(attachModel(model), id, docId, shared, user.name);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { model, id, docId } = await params;
    return removeDoc(attachModel(model), id, docId, user.name);
  });
}
