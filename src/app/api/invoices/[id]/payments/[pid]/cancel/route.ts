import { handle, requireUser } from '@/lib/api';
import { cancelPayment } from '@/lib/credits';
import { cancelSchema } from '@/lib/schemas';
import { getCustomerDoc } from '@/lib/creditdocs';

/** Cancels a whole payment (a mistake, a bounced cheque). It stays listed as cancelled and is reversed in the books. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id, pid } = await params;
    await cancelPayment('customer', id, pid, cancelSchema.parse(await req.json()).reason, user.name);
    return getCustomerDoc(id);
  });
}
