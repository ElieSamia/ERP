import { handle, requireUser } from '@/lib/api';
import { conversations } from '@/lib/whatsapp';

export async function GET() {
  return handle(async () => { await requireUser(); return conversations(); });
}
