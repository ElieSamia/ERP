import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { inviteSchema, inviteUser, listPortalUsers } from '@/lib/portal';

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    return listPortalUsers(String(new URL(req.url).searchParams.get('contactId') || ''));
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const contactId = z.string().min(1).parse(body.contactId);
    return inviteUser(contactId, inviteSchema.parse(body), new URL(req.url).origin, user.name);
  });
}
