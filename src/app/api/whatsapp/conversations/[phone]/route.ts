import { handle, requireUser } from '@/lib/api';
import { thread } from '@/lib/whatsapp';

export async function GET(_req: Request, { params }: { params: Promise<{ phone: string }> }) {
  return handle(async () => { await requireUser(); return thread((await params).phone); });
}
