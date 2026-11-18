import { handle, requireUser } from '@/lib/api';
import { EMPTY_FILTER, reachable, resolveAudience } from '@/lib/marketing';
import { filterSchema } from '@/lib/schemas';

/** Who a filter matches right now: totals for the counts and the first 100 people for the list. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const body = await req.json();
    const all = await resolveAudience(filterSchema.parse({ ...EMPTY_FILTER, ...(body.filter || {}) }));
    return {
      total: all.length, reachable: reachable(all).length, noEmail: all.filter((m) => !m.email).length, unsubscribed: all.filter((m) => m.email && m.marketing === 'no').length,
      members: all.slice(0, 100),
    };
  });
}
