import { handle, requireUser } from '@/lib/api';
import { sourceLog } from '@/lib/enquiries';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => { await requireUser('admin'); return sourceLog((await params).id); });
}
