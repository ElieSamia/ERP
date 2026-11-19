import { handle, requireUser } from '@/lib/api';
import { checkConnection } from '@/lib/rates';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => { await requireUser('admin'); return { message: await checkConnection((await params).id) }; });
}
