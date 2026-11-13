import { z } from 'zod';
import { handle, HttpError, requireUser } from '@/lib/api';
import { addOrderMessage } from '@/lib/portal';
import { getPurchase } from '@/lib/finance';
import { logActivity } from '@/lib/activity';

/** Your team writes to the supplier on an order. They see it in the supplier portal. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = (await params).id;
    const { text } = z.object({ text: z.string().trim().min(1, 'Write a message first.').max(4000) }).parse(await req.json());
    if (!(await getPurchase(id))) throw new HttpError(404, 'Order not found.');
    await addOrderMessage(id, 'staff', user.name, text);
    await logActivity('purchase', id, user.name, 'Message sent to the supplier.');
    return getPurchase(id);
  });
}
