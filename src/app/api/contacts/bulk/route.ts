import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { db } from '@/lib/db';
import { handle, HttpError, requireUser } from '@/lib/api';
import { logActivity } from '@/lib/activity';

const schema = z.object({
  ids: z.array(z.string().refine((x) => ObjectId.isValid(x))).min(1, 'Select at least one contact.').max(5000),
  action: z.enum(['addTag', 'removeTag', 'addToAudience']),
  tag: z.string().trim().max(30).default(''),
  audienceId: z.string().default(''),
});

/** Acting on many contacts at once: tag them, untag them, or add them to a hand-picked audience. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.parse(await req.json());
    const d = await db();
    const ids = b.ids.map((x) => new ObjectId(x));
    if (b.action === 'addTag' || b.action === 'removeTag') {
      if (!b.tag) throw new HttpError(400, 'Type the tag.');
      const r = b.action === 'addTag'
        ? await d.collection('contacts').updateMany({ _id: { $in: ids } }, { $addToSet: { tags: b.tag } })
        : await d.collection('contacts').updateMany({ _id: { $in: ids } }, { $pull: { tags: b.tag } } as never);
      for (const id of b.ids.slice(0, 200)) await logActivity('contact', id, user.name, `${b.action === 'addTag' ? 'Tag added' : 'Tag removed'}: ${b.tag}.`);
      return { changed: r.modifiedCount };
    }
    if (!ObjectId.isValid(b.audienceId)) throw new HttpError(400, 'Choose the audience.');
    const r = await d.collection('audiences').updateOne({ _id: new ObjectId(b.audienceId) }, { $addToSet: { 'filter.includeIds': { $each: b.ids } } } as never);
    if (!r.matchedCount) throw new HttpError(404, 'Audience not found.');
    return { changed: b.ids.length };
  });
}
