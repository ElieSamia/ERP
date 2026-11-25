import { z } from 'zod';
import { handle, requireUser } from '@/lib/api';
import { allocateCredit } from '@/lib/credits';

/** Applies remaining credit to another open invoice (or bill) of the same customer (or supplier). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const b = z.object({ docId: z.string().min(1, 'Choose the document.'), amount: z.coerce.number().positive('Enter an amount above zero.') }).parse(await req.json());
    return allocateCredit((await params).id, b.docId, b.amount, user.name);
  });
}
