import { handle, requireUser } from '@/lib/api';
import { refundCredit } from '@/lib/credits';
import { refundSchema } from '@/lib/schemas';
import { checkAccount } from '@/lib/finance';

/** Pays credit back to the customer, or records money received back from a supplier. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const b = refundSchema.parse(await req.json());
    await checkAccount(b.accountId);
    return refundCredit((await params).id, b, user.name);
  });
}
