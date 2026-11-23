import { EMPTY_FILTER } from '@/lib/marketing';
import { AudienceEditor } from '@/components/AudienceEditor';
import { db } from '@/lib/db';

export default async function NewAudience() {
  const tags = ((await (await db()).collection('contacts').distinct('tags')) as string[]).filter(Boolean).sort();
  return <AudienceEditor empty={EMPTY_FILTER} allTags={tags} />;
}
