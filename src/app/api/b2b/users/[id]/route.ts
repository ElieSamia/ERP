import { db } from '@/lib/db';
import { handle, HttpError, oid, requireUser } from '@/lib/api';
import { editPortalUser, listPortalUsers, userEditSchema } from '@/lib/portal';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const data = userEditSchema.omit({ reset: true }).parse(await req.json());
    const u = await (await db()).collection('portalUsers').findOne({ _id: oid((await params).id) });
    if (!u) throw new HttpError(404, 'User not found.');
    await editPortalUser(u, data, user.name);
    return listPortalUsers(String(u.contactId));
  });
}
