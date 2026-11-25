import { handle, requireUser } from '@/lib/api';
import { cancelRefund } from '@/lib/credits';
import { cancelSchema } from '@/lib/schemas';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id, rid } = await params;
    return cancelRefund(id, rid, cancelSchema.parse(await req.json()).reason, user.name);
  });
}
