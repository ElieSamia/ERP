import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { handle, requireUser } from '@/lib/api';
import { newUserSchema } from '@/lib/schemas';
import { listUsers } from '@/lib/queries';

export async function GET() {
  return handle(async () => {
    await requireUser('admin');
    return listUsers();
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser('admin');
    const u = newUserSchema.parse(await req.json());
    await (await db()).collection('users').insertOne({
      name: u.name, email: u.email, role: u.role, active: true, passwordHash: await hash(u.password, 12), createdAt: new Date(),
    });
    return listUsers();
  });
}
