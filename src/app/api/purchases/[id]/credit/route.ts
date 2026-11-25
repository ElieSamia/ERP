import { handle, requireUser } from '@/lib/api';
import { createCredit } from '@/lib/credits';
import { creditSchema } from '@/lib/schemas';

/** A credit note for all or part of this document. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    return createCredit('supplier', (await params).id, creditSchema.parse(await req.json()), user.name);
  });
}
