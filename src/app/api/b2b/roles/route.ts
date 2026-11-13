import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { getRoles, roleSchema } from '@/lib/portal';

export async function GET() {
  return handle(async () => { await requireUser(); return getRoles(); });
}
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const data = roleSchema.parse(await req.json());
    await (await db()).collection('portalRoles').insertOne({ ...data, createdAt: new Date() });
    return getRoles();
  });
}
